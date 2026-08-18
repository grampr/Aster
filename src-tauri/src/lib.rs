use keyring::{Entry, Error as KeyringError};
#[cfg(desktop)]
use tauri::Manager;

const KEYRING_SERVICE: &str = "dev.aster.desktop";
const REFRESH_TOKEN_ACCOUNT: &str = "default-session-refresh-token";

fn refresh_token_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, REFRESH_TOKEN_ACCOUNT)
        .map_err(|error| format!("credential store is unavailable: {error}"))
}

#[tauri::command]
fn save_refresh_token(refresh_token: String) -> Result<(), String> {
    if refresh_token.is_empty() {
        return Err("refresh token must not be empty".to_owned());
    }

    refresh_token_entry()?
        .set_password(&refresh_token)
        .map_err(|error| format!("failed to store refresh token: {error}"))
}

#[tauri::command]
fn load_refresh_token() -> Result<Option<String>, String> {
    match refresh_token_entry()?.get_password() {
        Ok(refresh_token) => Ok(Some(refresh_token)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(error) => Err(format!("failed to load refresh token: {error}")),
    }
}

#[tauri::command]
fn delete_refresh_token() -> Result<(), String> {
    match refresh_token_entry()?.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(error) => Err(format!("failed to delete refresh token: {error}")),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }));

    builder
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            save_refresh_token,
            load_refresh_token,
            delete_refresh_token
        ])
        .run(tauri::generate_context!())
        .expect("error while running Aster desktop");
}

#[cfg(test)]
mod tests {
    use super::save_refresh_token;

    #[test]
    fn rejects_an_empty_refresh_token_before_keyring_access() {
        assert_eq!(
            save_refresh_token(String::new()).unwrap_err(),
            "refresh token must not be empty"
        );
    }
}
