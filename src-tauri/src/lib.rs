use std::process::Command;
use tauri::Manager;

#[tauri::command]
fn display_off() -> Result<String, String> {
    let output = Command::new("vcgencmd")
        .args(["display_power", "0"])
        .output()
        .map_err(|e| format!("Failed to run vcgencmd: {e}"))?;

    if output.status.success() {
        Ok("Display off".into())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
fn display_on() -> Result<String, String> {
    let output = Command::new("vcgencmd")
        .args(["display_power", "1"])
        .output()
        .map_err(|e| format!("Failed to run vcgencmd: {e}"))?;

    if output.status.success() {
        Ok("Display on".into())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
fn display_status() -> Result<String, String> {
    let output = Command::new("vcgencmd")
        .args(["display_power"])
        .output()
        .map_err(|e| format!("Failed to run vcgencmd: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    if output.status.success() {
        Ok(stdout.trim().into())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
fn wifi_scan() -> Result<String, String> {
    let output = Command::new("nmcli")
        .args(["-t", "-f", "SSID,SIGNAL,SECURITY", "device", "wifi", "list"])
        .output()
        .map_err(|e| format!("Failed to run nmcli: {e}"))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
fn wifi_connect(ssid: String, password: String) -> Result<String, String> {
    let mut args = vec!["device", "wifi", "connect", &ssid];
    if !password.is_empty() {
        args.extend(["password", &password]);
    }

    let output = Command::new("nmcli")
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to run nmcli: {e}"))?;

    if output.status.success() {
        Ok(format!("Connected to {ssid}"))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
fn wifi_status() -> Result<String, String> {
    let output = Command::new("nmcli")
        .args(["-t", "-f", "NAME", "connection", "show", "--active"])
        .output()
        .map_err(|e| format!("Failed to run nmcli: {e}"))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let first = stdout.lines().next().unwrap_or("").trim();
        Ok(first.into())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
fn wifi_disconnect(ssid: String) -> Result<String, String> {
    let output = Command::new("nmcli")
        .args(["connection", "down", &ssid])
        .output()
        .map_err(|e| format!("Failed to run nmcli: {e}"))?;

    if output.status.success() {
        Ok(format!("Disconnected from {ssid}"))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            display_off,
            display_on,
            display_status,
            wifi_scan,
            wifi_connect,
            wifi_status,
            wifi_disconnect,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
