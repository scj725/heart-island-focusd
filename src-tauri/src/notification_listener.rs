use std::{
    collections::HashSet,
    fs::OpenOptions,
    io::Write,
    sync::{Arc, Mutex},
    thread,
    time::Duration,
    net::TcpListener,
};

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use windows::{
    UI::Notifications::{Management::UserNotificationListener, NotificationKinds},
    Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED},
};

const POLL_INTERVAL: Duration = Duration::from_secs(2);
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(5);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WindowsNotificationEvent {
    pub(crate) source: String,
    pub(crate) notification_id: u32,
    pub(crate) received_at: i64,
    #[serde(default)]
    pub(crate) is_external: bool,
    #[serde(default)]
    pub(crate) kind: String,
    #[serde(default)]
    pub(crate) title: String,
    #[serde(default)]
    pub(crate) content: String,
    #[serde(default)]
    pub(crate) media_url: Option<String>,
    #[serde(default)]
    pub(crate) action_url: Option<String>,
    #[serde(default)]
    pub(crate) duration_ms: u64,
    #[serde(default)]
    pub(crate) priority: String,
}

pub(crate) fn start_external_server(app: AppHandle) {
    thread::spawn(move || {
        let Ok(listener) = TcpListener::bind("127.0.0.1:47821") else {
            log_line("external notification server failed to bind 127.0.0.1:47821");
            return;
        };
        log_line("external notification server listening on 127.0.0.1:47821");
        for stream in listener.incoming().flatten() {
            let app = app.clone();
            thread::spawn(move || handle_external_request(stream, app));
        }
    });
}

fn handle_external_request(mut stream: std::net::TcpStream, app: AppHandle) {
    use std::io::{Read, Write};
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let mut request = Vec::with_capacity(4096);
    let mut chunk = [0u8; 2048];
    let mut body_start = None;
    let mut content_length = 0usize;
    while request.len() < 1_048_576 {
        let Ok(read) = stream.read(&mut chunk) else { break };
        if read == 0 { break; }
        request.extend_from_slice(&chunk[..read]);
        if body_start.is_none() {
            if let Some(position) = request.windows(4).position(|value| value == b"\r\n\r\n") {
                let headers = String::from_utf8_lossy(&request[..position]);
                content_length = headers.lines().find_map(|line| {
                    line.strip_prefix("Content-Length:")?.trim().parse().ok()
                }).unwrap_or(0);
                body_start = Some(position + 4);
            }
        }
        if let Some(start) = body_start {
            if request.len() >= start + content_length { break; }
        }
    }
    let Some(start) = body_start else {
        let _ = stream.write_all(b"HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\ninvalid request");
        return;
    };
    let end = (start + content_length).min(request.len());
    let Ok(payload) = serde_json::from_slice::<serde_json::Value>(&request[start..end]) else {
        let _ = stream.write_all(b"HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\ninvalid json");
        return;
    };
    let kind = payload.get("type").and_then(|v| v.as_str()).unwrap_or("text");
    if !matches!(kind, "text" | "voice" | "image" | "video") {
        let _ = stream.write_all(b"HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\ntype must be text, voice, image, or video");
        return;
    }
    let title = payload.get("title").and_then(|v| v.as_str()).unwrap_or("").trim();
    let content = payload.get("content").and_then(|v| v.as_str()).unwrap_or("").trim();
    if title.chars().count() > 80 || content.chars().count() > 2_000 {
        let _ = stream.write_all(b"HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\ntitle or content is too long");
        return;
    }
    let url = payload.get("url").and_then(|v| v.as_str()).map(str::trim).filter(|url| !url.is_empty()).map(str::to_string);
    let action_url = payload.get("actionUrl").and_then(|v| v.as_str()).map(str::trim).filter(|url| !url.is_empty()).map(str::to_string);
    if url.as_deref().is_some_and(|url| !is_allowed_media_url(url)) || action_url.as_deref().is_some_and(|url| !is_allowed_web_url(url)) {
        let _ = stream.write_all(b"HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\nurl must use http or https");
        return;
    }
    let duration_seconds = payload.get("duration").and_then(|v| v.as_u64()).unwrap_or(12).clamp(3, 60);
    let priority = match payload.get("priority").and_then(|v| v.as_str()).unwrap_or("normal") {
        "high" => "high",
        "normal" => "normal",
        _ => {
            let _ = stream.write_all(b"HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\npriority must be normal or high");
            return;
        }
    };
    let display_label = match kind {
        "voice" => "\u{8bed}\u{97f3}",
        "image" => "\u{56fe}\u{7247}",
        "video" => "\u{89c6}\u{9891}",
        _ => "\u{6d88}\u{606f}",
    };
    let source = if title.is_empty() {
        if content.is_empty() {
            format!("\u{5916}\u{90e8}{display_label}\u{6d88}\u{606f}")
        } else {
            content.to_string()
        }
    } else if content.is_empty() {
        format!("{title}\u{00b7}{display_label}\u{6d88}\u{606f}")
    } else {
        format!("{title}\u{00b7}{content}")
    };
    let _ = app.emit("windows-notification-debug", WindowsNotificationEvent {
        source, notification_id: chrono_like_now() as u32, received_at: chrono_like_now(),
        is_external: true,
        kind: kind.to_string(), title: title.to_string(), content: content.to_string(), media_url: url,
        action_url, duration_ms: duration_seconds * 1_000, priority: priority.to_string(),
    });
    let _ = stream.write_all(b"HTTP/1.1 200 OK\r\nConnection: close\r\n\r\nok");
}

pub(crate) fn start(app: AppHandle) {
    let seen_ids = Arc::new(Mutex::new(HashSet::<u32>::new()));
    thread::spawn(move || {
        log_line("listener thread started");
        let _com_initialized = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED).is_ok() };
        log_line(&format!("COM initialized: {_com_initialized}"));
        let mut last_count: Option<u32> = None;
        let mut last_heartbeat = std::time::Instant::now();
        let listener = match UserNotificationListener::Current() {
            Ok(listener) => listener,
            Err(error) => {
                log_line(&format!("open listener failed: {error}"));
                eprintln!("failed to open Windows notification listener: {error}");
                return;
            }
        };

        let access_operation = match listener.RequestAccessAsync() {
            Ok(operation) => operation,
            Err(error) => {
                eprintln!("failed to create Windows notification access request: {error}");
                return;
            }
        };
        match pollster::block_on(access_operation) {
            Ok(status) => {
                log_line(&format!("access status: {status:?}"));
                eprintln!("Windows notification listener access: {status:?}");
            }
            Err(error) => {
                log_line(&format!("access request failed: {error}"));
                eprintln!("failed to request Windows notification listener access: {error}");
                return;
            }
        }

        loop {
            log_line("calling GetNotificationsAsync");
            match listener.GetNotificationsAsync(NotificationKinds::Toast) {
                Ok(operation) => match pollster::block_on(operation) {
                    Ok(notifications) => {
                        let count = notifications.Size().unwrap_or(0);
                        log_line(&format!("notification count: {count}"));
                        if last_count != Some(count) || last_heartbeat.elapsed() >= HEARTBEAT_INTERVAL {
                            last_count = Some(count);
                            last_heartbeat = std::time::Instant::now();
                            log_line(&format!("notification listener online; count={count}"));
                        }

                        if let Ok(mut seen) = seen_ids.lock() {
                            for index in 0..count {
                                let Ok(notification) = notifications.GetAt(index) else { continue };
                                let Ok(notification_id) = notification.Id() else { continue };
                                if !seen.insert(notification_id) { continue; }

                                let source = describe_notification(&notification, notification_id);
                                log_line(&format!("notification found: {source}"));
                                let _ = app.emit(
                                    "windows-notification-debug",
                                    WindowsNotificationEvent {
                                        source,
                                        notification_id,
                                        received_at: chrono_like_now(),
                                        is_external: false,
                                        kind: "text".to_string(), title: String::new(), content: String::new(), media_url: None, action_url: None, duration_ms: 0, priority: String::new(),
                                    },
                                );
                            }

                            if seen.len() > 512 {
                                seen.clear();
                            }
                        }
                    }
                    Err(error) => {
                        log_line(&format!("notification operation failed: {error}"));
                        let _ = app.emit(
                            "windows-notification-debug",
                            WindowsNotificationEvent {
                                source: format!("notification read failed: {error}"),
                                notification_id: 0,
                                received_at: chrono_like_now(),
                                is_external: false,
                                kind: "text".to_string(), title: String::new(), content: String::new(), media_url: None, action_url: None, duration_ms: 0, priority: String::new(),
                            },
                        );
                    }
                },
                Err(error) => {
                    log_line(&format!("notification request creation failed: {error}"));
                    let _ = app.emit(
                        "windows-notification-debug",
                        WindowsNotificationEvent {
                            source: format!("notification request failed: {error}"),
                                notification_id: 0,
                                received_at: chrono_like_now(),
                                is_external: false,
                                kind: "text".to_string(), title: String::new(), content: String::new(), media_url: None, action_url: None, duration_ms: 0, priority: String::new(),
                        },
                    );
                }
            }
            thread::sleep(POLL_INTERVAL);
        }
    });
}

fn is_allowed_web_url(url: &str) -> bool {
    url.starts_with("https://") || url.starts_with("http://")
}

fn is_allowed_media_url(url: &str) -> bool {
    is_allowed_web_url(url) || url.starts_with("data:image/")
}

fn describe_notification(notification: &windows::UI::Notifications::UserNotification, id: u32) -> String {
    let app_name = notification
        .AppInfo()
        .and_then(|info| info.DisplayInfo())
        .and_then(|display| display.DisplayName())
        .map(|value| value.to_string())
        .unwrap_or_else(|_| "未知来源".to_string());

    let mut texts = Vec::new();
    if let Ok(visual) = notification.Notification().and_then(|value| value.Visual()) {
        if let Ok(bindings) = visual.Bindings() {
            if let Ok(size) = bindings.Size() {
                for index in 0..size {
                    let Ok(binding) = bindings.GetAt(index) else { continue };
                    if let Ok(elements) = binding.GetTextElements() {
                        if let Ok(element_count) = elements.Size() {
                            for element_index in 0..element_count {
                                if let Ok(element) = elements.GetAt(element_index) {
                                    if let Ok(text) = element.Text() {
                                        let value = text.to_string();
                                        if !value.trim().is_empty() && !texts.contains(&value) {
                                            texts.push(value);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if texts.is_empty() {
        format!("{app_name} · 通知 id={id}（未读取到正文）")
    } else {
        format!("{app_name} · {}", texts.join(" / "))
    }
}

fn log_line(message: &str) {
    let path = std::env::temp_dir().join("focusd-notification-listener.log");
    let line = format!("{} | {message}\n", chrono_like_now());
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = file.write_all(line.as_bytes());
    }
}

fn chrono_like_now() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}
