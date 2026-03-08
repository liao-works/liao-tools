use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};
use tauri_plugin_store::StoreExt;

#[cfg(target_os = "windows")]
use windows::{
    core::PCWSTR,
    Win32::{
        Foundation::HWND,
        UI::WindowsAndMessaging::{
            FindWindowExW, FindWindowW, SendMessageTimeoutW, SetParent, SetWindowPos,
            HWND_NOTOPMOST, HWND_TOPMOST, SMTO_NORMAL, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
            SWP_SHOWWINDOW, WM_USER,
        },
    },
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TodoStatus {
    Pending,
    Completed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TodoPriority {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoTask {
    pub id: String,
    pub title: String,
    pub status: TodoStatus,
    pub priority: TodoPriority,
    pub created_at: u64,
    pub completed_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetPosition {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WidgetTheme {
    Dark,
    Light,
    Blue,
    Purple,
    Green,
    Orange,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeColors {
    pub background: String,
    pub text: String,
    pub text_secondary: String,
    pub border: String,
    pub accent: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoWidgetConfig {
    pub position: WidgetPosition,
    pub width: u32,
    pub height: u32,
    pub opacity: f32,
    pub is_desktop_mode: bool,
    pub is_pinned: bool,
    pub theme: WidgetTheme,
    pub custom_colors: Option<ThemeColors>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyConfig {
    pub toggle: String,
    pub toggle_pin: String,
    pub quick_add: String,
}

impl PartialEq for HotkeyConfig {
    fn eq(&self, other: &Self) -> bool {
        self.toggle == other.toggle
            && self.toggle_pin == other.toggle_pin
            && self.quick_add == other.quick_add
    }
}

impl Eq for HotkeyConfig {}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoConfig {
    pub widget: TodoWidgetConfig,
    pub hotkeys: HotkeyConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoStoreData {
    pub tasks: Vec<TodoTask>,
    pub config: TodoConfig,
    pub version: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteWindowState {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub is_detached: bool,
    pub is_pinned: bool,
    pub is_desktop_mode: bool,
    pub opacity: f32,
}

pub struct NoteWindowManager {
    windows: Mutex<HashMap<String, String>>,
}

impl NoteWindowManager {
    pub fn new() -> Self {
        Self {
            windows: Mutex::new(HashMap::new()),
        }
    }

    pub fn register(&self, note_id: String, window_label: String) {
        if let Ok(mut windows) = self.windows.lock() {
            windows.insert(note_id, window_label);
        }
    }

    pub fn unregister(&self, note_id: &str) {
        if let Ok(mut windows) = self.windows.lock() {
            windows.remove(note_id);
        }
    }

    pub fn get_all_window_labels(&self) -> Vec<String> {
        if let Ok(windows) = self.windows.lock() {
            return windows.values().cloned().collect();
        }

        vec![]
    }
}

impl Default for NoteWindowManager {
    fn default() -> Self {
        Self::new()
    }
}

pub struct StickyNotesShortcutManager {
    shortcuts: Mutex<Vec<Shortcut>>,
    hotkeys: Mutex<Option<HotkeyConfig>>,
}

impl StickyNotesShortcutManager {
    pub fn new() -> Self {
        Self {
            shortcuts: Mutex::new(Vec::new()),
            hotkeys: Mutex::new(None),
        }
    }
}

impl Default for StickyNotesShortcutManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(target_os = "windows")]
fn embed_window_into_desktop(hwnd: isize) -> Result<(), String> {
    unsafe {
        let hwnd = HWND(hwnd as *mut std::ffi::c_void);
        let progman_class: Vec<u16> = "Progman\0".encode_utf16().collect();
        let workerw_class: Vec<u16> = "WorkerW\0".encode_utf16().collect();
        let defview_class: Vec<u16> = "SHELLDLL_DefView\0".encode_utf16().collect();

        let progman = FindWindowW(PCWSTR(progman_class.as_ptr()), PCWSTR(std::ptr::null()))
            .map_err(|e| format!("Failed to find Progman window: {e}"))?;
        if progman.0.is_null() {
            return Err("Progman window is null".to_string());
        }

        let _ = SendMessageTimeoutW(
            progman,
            WM_USER + 0x02C,
            windows::Win32::Foundation::WPARAM(0x0D),
            windows::Win32::Foundation::LPARAM(0),
            SMTO_NORMAL,
            1000,
            None,
        );

        let mut workerw = HWND(std::ptr::null_mut());
        let mut temp_workerw = HWND(std::ptr::null_mut());

        loop {
            temp_workerw = FindWindowExW(
                HWND(std::ptr::null_mut()),
                temp_workerw,
                PCWSTR(workerw_class.as_ptr()),
                PCWSTR(std::ptr::null()),
            )
            .unwrap_or(HWND(std::ptr::null_mut()));

            if temp_workerw.0.is_null() {
                break;
            }

            let defview = FindWindowExW(
                temp_workerw,
                HWND(std::ptr::null_mut()),
                PCWSTR(defview_class.as_ptr()),
                PCWSTR(std::ptr::null()),
            )
            .unwrap_or(HWND(std::ptr::null_mut()));

            if !defview.0.is_null() {
                workerw = FindWindowExW(
                    HWND(std::ptr::null_mut()),
                    temp_workerw,
                    PCWSTR(workerw_class.as_ptr()),
                    PCWSTR(std::ptr::null()),
                )
                .unwrap_or(progman);
                break;
            }
        }

        if workerw.0.is_null() {
            workerw = progman;
        }

        let result = SetParent(hwnd, workerw).map_err(|e| format!("SetParent failed: {e}"))?;
        if result.0.is_null() {
            return Err(format!(
                "SetParent returned null: {:?}",
                std::io::Error::last_os_error()
            ));
        }

        let _ = SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW | SWP_NOACTIVATE,
        );
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn unembed_window_from_desktop(hwnd: isize, pinned: bool) -> Result<(), String> {
    unsafe {
        let hwnd = HWND(hwnd as *mut std::ffi::c_void);
        SetParent(hwnd, HWND(std::ptr::null_mut()))
            .map_err(|e| format!("SetParent failed: {e}"))?;
        let _ = SetWindowPos(
            hwnd,
            if pinned { HWND_TOPMOST } else { HWND_NOTOPMOST },
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW | SWP_NOACTIVATE,
        );
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn embed_window_into_desktop(_hwnd: isize) -> Result<(), String> {
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn unembed_window_from_desktop(_hwnd: isize, _pinned: bool) -> Result<(), String> {
    Ok(())
}

fn default_config() -> TodoConfig {
    TodoConfig {
        widget: TodoWidgetConfig {
            position: WidgetPosition { x: 100, y: 100 },
            width: 360,
            height: 460,
            opacity: 0.9,
            is_desktop_mode: true,
            is_pinned: false,
            theme: WidgetTheme::Dark,
            custom_colors: None,
        },
        hotkeys: HotkeyConfig {
            toggle: "CommandOrControl+Alt+T".to_string(),
            toggle_pin: "CommandOrControl+Alt+P".to_string(),
            quick_add: "CommandOrControl+Alt+N".to_string(),
        },
    }
}

fn load_config_from_store(app: &AppHandle) -> Result<TodoConfig, String> {
    let store = app
        .store("sticky-notes")
        .map_err(|e| format!("Failed to open store: {e}"))?;

    Ok(store
        .get("config")
        .and_then(|v| serde_json::from_value::<TodoConfig>(v.clone()).ok())
        .unwrap_or_else(default_config))
}

fn save_config_to_store(app: &AppHandle, config: &TodoConfig) -> Result<(), String> {
    let store = app
        .store("sticky-notes")
        .map_err(|e| format!("Failed to open store: {e}"))?;

    store.set(
        "config",
        serde_json::to_value(config).map_err(|e| format!("Serialize config failed: {e}"))?,
    );
    store
        .save()
        .map_err(|e| format!("Failed to save store: {e}"))?;

    Ok(())
}

fn update_todo_widget_layout_in_store(
    app: &AppHandle,
    position: Option<WidgetPosition>,
    width: Option<u32>,
    height: Option<u32>,
) -> Result<TodoConfig, String> {
    let mut config = load_config_from_store(app)?;
    if let Some(position) = position {
        config.widget.position = position;
    }
    if let Some(width) = width {
        config.widget.width = width;
    }
    if let Some(height) = height {
        config.widget.height = height;
    }
    save_config_to_store(app, &config)?;
    Ok(config)
}

fn widget_config_to_window_state(widget: &TodoWidgetConfig) -> NoteWindowState {
    NoteWindowState {
        x: widget.position.x,
        y: widget.position.y,
        width: widget.width,
        height: widget.height,
        is_detached: true,
        is_pinned: widget.is_pinned,
        is_desktop_mode: widget.is_desktop_mode,
        opacity: widget.opacity,
    }
}

fn should_center_widget_position(state: &NoteWindowState) -> bool {
    (state.x == 100 && state.y == 100) || state.x < 0 || state.y < 0
}

fn center_todo_widget_if_needed(
    app: &AppHandle,
    note_id: &str,
    state: &NoteWindowState,
) -> NoteWindowState {
    if note_id != "todo-widget" || !should_center_widget_position(state) {
        return state.clone();
    }

    let monitor = app
        .get_webview_window("main")
        .and_then(|window| window.current_monitor().ok().flatten())
        .or_else(|| {
            app.get_webview_window("main")
                .and_then(|window| window.primary_monitor().ok().flatten())
        });

    if let Some(monitor) = monitor {
        let monitor_size = monitor.size();
        let monitor_position = monitor.position();
        return NoteWindowState {
            x: monitor_position.x + ((monitor_size.width as i32 - state.width as i32) / 2),
            y: monitor_position.y + ((monitor_size.height as i32 - state.height as i32) / 2),
            ..state.clone()
        };
    }

    state.clone()
}

fn create_or_show_note_window(
    app: &AppHandle,
    note_id: &str,
    window_state: &NoteWindowState,
    focus_window: bool,
) -> Result<(), String> {
    let window_state = center_todo_widget_if_needed(app, note_id, window_state);
    let label = format!("note-{note_id}");

    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.set_always_on_top(window_state.is_pinned);
        let _ = window.set_skip_taskbar(window_state.is_desktop_mode);
        let _ = apply_window_geometry(&window, &window_state);

        #[cfg(target_os = "windows")]
        {
            if let Ok(hwnd) = window.hwnd() {
                if window_state.is_desktop_mode {
                    let _ = embed_window_into_desktop(hwnd.0 as isize);
                } else {
                    let _ = unembed_window_from_desktop(hwnd.0 as isize, window_state.is_pinned);
                }
            }
        }

        let _ = window.show();
        if focus_window {
            let _ = window.set_focus();
        }
        return Ok(());
    }

    let builder = WebviewWindowBuilder::new(
        app,
        &label,
        WebviewUrl::App("/todo-widget".into()),
    )
    .title("Todo List")
    .inner_size(window_state.width as f64, window_state.height as f64)
    .position(window_state.x as f64, window_state.y as f64)
    .decorations(false)
    .always_on_top(window_state.is_pinned)
    .skip_taskbar(window_state.is_desktop_mode);

    #[cfg(not(target_os = "macos"))]
    let builder = builder.transparent(true);

    let window = builder
        .build()
        .map_err(|e| format!("Failed to create window: {e}"))?;

    let _ = apply_window_geometry(&window, &window_state);

    #[cfg(target_os = "windows")]
    if window_state.is_desktop_mode {
        if let Ok(hwnd) = window.hwnd() {
            let _ = embed_window_into_desktop(hwnd.0 as isize);
        }
    }

    if focus_window {
        let _ = window.set_focus();
    }

    if let Some(manager) = app.try_state::<NoteWindowManager>() {
        manager.register(note_id.to_string(), label);
    }

    Ok(())
}

fn apply_window_geometry(
    window: &tauri::WebviewWindow,
    state: &NoteWindowState,
) -> Result<(), String> {
    window
        .set_size(tauri::Size::Physical(tauri::PhysicalSize {
            width: state.width,
            height: state.height,
        }))
        .map_err(|e| format!("Failed to set size: {e}"))?;

    let outer_position = window
        .outer_position()
        .map_err(|e| format!("Failed to read outer position: {e}"))?;
    let inner_position = window
        .inner_position()
        .map_err(|e| format!("Failed to read inner position: {e}"))?;

    let offset_x = inner_position.x - outer_position.x;
    let offset_y = inner_position.y - outer_position.y;
    let target_outer_x = state.x - offset_x;
    let target_outer_y = state.y - offset_y;

    window
        .set_position(tauri::Position::Physical(tauri::PhysicalPosition {
            x: target_outer_x,
            y: target_outer_y,
        }))
        .map_err(|e| format!("Failed to set position: {e}"))?;

    Ok(())
}

fn show_todo_widget(app: &AppHandle, focus_window: bool) -> Result<(), String> {
    let config = load_config_from_store(app)?;
    create_or_show_note_window(
        app,
        "todo-widget",
        &widget_config_to_window_state(&config.widget),
        focus_window,
    )
}

fn emit_todo_widget_focus_input(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("note-todo-widget") {
        let _ = window.emit("todo-widget-focus-input", ());
    }
}

fn raise_todo_widget_for_input(app: &AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window("note-todo-widget") else {
        return Ok(());
    };

    let was_always_on_top = window.is_always_on_top().unwrap_or(false);

    let _ = window.unminimize();
    window
        .show()
        .map_err(|e| format!("Failed to show todo widget: {e}"))?;

    if !was_always_on_top {
        window
            .set_always_on_top(true)
            .map_err(|e| format!("Failed to raise todo widget: {e}"))?;
    }

    let _ = window.set_focus();

    if !was_always_on_top {
        let app_handle = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_millis(1500)).await;

            if let Some(window) = app_handle.get_webview_window("note-todo-widget") {
                let _ = window.set_always_on_top(false);
            }
        });
    }

    Ok(())
}

fn open_main_window_for_todo_input(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }

    app.emit("sticky-notes-open-main-for-input", ())
        .map_err(|e| format!("Failed to emit open-main event: {e}"))?;
    Ok(())
}

fn toggle_todo_widget_visibility_inner(app: &AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("note-todo-widget") {
        let visible = window
            .is_visible()
            .map_err(|e| format!("Failed to inspect window visibility: {e}"))?;

        if visible {
            window.hide().map_err(|e| format!("Failed to hide window: {e}"))?;
            return Ok(false);
        }

        window.show().map_err(|e| format!("Failed to show window: {e}"))?;
        let _ = window.set_focus();
        return Ok(true);
    }

    show_todo_widget(app, true)?;
    Ok(true)
}

fn toggle_todo_widget_pin_inner(app: &AppHandle) -> Result<bool, String> {
    let mut config = load_config_from_store(app)?;
    config.widget.is_pinned = !config.widget.is_pinned;
    if config.widget.is_pinned {
        config.widget.is_desktop_mode = false;
    }

    save_config_to_store(app, &config)?;

    if let Some(window) = app.get_webview_window("note-todo-widget") {
        if config.widget.is_pinned {
            #[cfg(target_os = "windows")]
            if let Ok(hwnd) = window.hwnd() {
                let _ = unembed_window_from_desktop(hwnd.0 as isize, true);
            }
        }

        window
            .set_always_on_top(config.widget.is_pinned)
            .map_err(|e| format!("Failed to set always on top: {e}"))?;
        window
            .set_skip_taskbar(config.widget.is_desktop_mode)
            .map_err(|e| format!("Failed to set skip taskbar: {e}"))?;
    }

    Ok(config.widget.is_pinned)
}

fn parse_shortcut(shortcut: &str) -> Result<Shortcut, String> {
    let normalized = shortcut.trim();
    let mut candidates = vec![
        normalized.to_string(),
        normalized.replace("CmdOrCtrl", "CommandOrControl"),
        normalized.replace("Ctrl", "Control"),
        normalized.replace("Cmd", "Super"),
    ];

    #[cfg(target_os = "macos")]
    {
        candidates.push(normalized.replace("CommandOrControl", "Super"));
        candidates.push(normalized.replace("CmdOrCtrl", "Super"));
    }

    #[cfg(not(target_os = "macos"))]
    {
        candidates.push(normalized.replace("CommandOrControl", "Control"));
        candidates.push(normalized.replace("CmdOrCtrl", "Control"));
    }

    candidates.dedup();

    let mut last_error: Option<String> = None;
    for candidate in candidates {
        match Shortcut::try_from(candidate.as_str()) {
            Ok(parsed) => return Ok(parsed),
            Err(err) => last_error = Some(err.to_string()),
        }
    }

    Err(format!(
        "Invalid shortcut '{}': {}",
        shortcut,
        last_error.unwrap_or_else(|| "unknown parse error".to_string())
    ))
}

pub fn register_global_shortcuts(app: &AppHandle) -> Result<(), String> {
    if app.try_state::<StickyNotesShortcutManager>().is_none() {
        app.manage(StickyNotesShortcutManager::new());
    }

    let configured_hotkeys = app
        .store("sticky-notes")
        .ok()
        .and_then(|store| {
            store
                .get("config")
                .and_then(|v| serde_json::from_value::<TodoConfig>(v.clone()).ok())
                .map(|c| c.hotkeys)
        })
        .unwrap_or_else(|| default_config().hotkeys);

    apply_global_shortcuts_from_config(app, &configured_hotkeys)
}

fn apply_global_shortcuts_from_config(
    app: &AppHandle,
    hotkeys: &HotkeyConfig,
) -> Result<(), String> {
    let manager = app
        .try_state::<StickyNotesShortcutManager>()
        .ok_or_else(|| "StickyNotesShortcutManager is not initialized".to_string())?;

    if let Ok(current_hotkeys) = manager.hotkeys.lock() {
        if current_hotkeys.as_ref() == Some(hotkeys) {
            return Ok(());
        }
    }

    let old_shortcuts = if let Ok(registered) = manager.shortcuts.lock() {
        registered.clone()
    } else {
        Vec::new()
    };

    for shortcut in old_shortcuts {
        let _ = app.global_shortcut().unregister(shortcut);
    }

    let quick_add_shortcut = parse_shortcut(&hotkeys.quick_add).unwrap_or_else(|_| {
        #[cfg(target_os = "macos")]
        {
            Shortcut::new(Some(Modifiers::SUPER | Modifiers::ALT), Code::KeyN)
        }
        #[cfg(not(target_os = "macos"))]
        {
            Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyN)
        }
    });
    let toggle_pin_shortcut = parse_shortcut(&hotkeys.toggle_pin).unwrap_or_else(|_| {
        #[cfg(target_os = "macos")]
        {
            Shortcut::new(Some(Modifiers::SUPER | Modifiers::ALT), Code::KeyP)
        }
        #[cfg(not(target_os = "macos"))]
        {
            Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyP)
        }
    });
    let toggle_shortcut = parse_shortcut(&hotkeys.toggle).unwrap_or_else(|_| {
        #[cfg(target_os = "macos")]
        {
            Shortcut::new(Some(Modifiers::SUPER | Modifiers::ALT), Code::KeyT)
        }
        #[cfg(not(target_os = "macos"))]
        {
            Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyT)
        }
    });

    let mut registered_shortcuts: Vec<Shortcut> = Vec::new();

    if app
        .global_shortcut()
        .on_shortcut(quick_add_shortcut, |app, _, _| {
            if app.get_webview_window("note-todo-widget").is_some() {
                if let Err(e) = show_todo_widget(app, true) {
                    log::error!("Failed to show todo widget for quick add: {e}");
                    return;
                }
                if let Err(e) = raise_todo_widget_for_input(app) {
                    log::error!("Failed to raise todo widget for quick add: {e}");
                }
                emit_todo_widget_focus_input(app);
            } else if let Err(e) = open_main_window_for_todo_input(app) {
                log::error!("Failed to open main todo view for quick add: {e}");
            }
        })
        .is_ok()
    {
        registered_shortcuts.push(quick_add_shortcut);
    }

    if app
        .global_shortcut()
        .on_shortcut(toggle_pin_shortcut, |app, _, _| {
            if let Err(e) = toggle_todo_widget_pin_inner(app) {
                log::error!("Failed to toggle todo widget pin: {e}");
            }
        })
        .is_ok()
    {
        registered_shortcuts.push(toggle_pin_shortcut);
    }

    if app
        .global_shortcut()
        .on_shortcut(toggle_shortcut, |app, _, _| {
            if let Err(e) = toggle_todo_widget_visibility_inner(app) {
                log::error!("Failed to toggle todo widget visibility: {e}");
            }
        })
        .is_ok()
    {
        registered_shortcuts.push(toggle_shortcut);
    }

    if registered_shortcuts.is_empty() {
        return Err("Failed to register any sticky notes shortcuts".to_string());
    }

    if let Ok(mut registered) = manager.shortcuts.lock() {
        *registered = registered_shortcuts;
    }
    if let Ok(mut current_hotkeys) = manager.hotkeys.lock() {
        *current_hotkeys = Some(hotkeys.clone());
    }

    Ok(())
}

#[tauri::command]
pub async fn load_sticky_notes(app: AppHandle) -> Result<Option<TodoStoreData>, String> {
    let store = app
        .store("sticky-notes")
        .map_err(|e| format!("Failed to open store: {e}"))?;

    let tasks = store
        .get("tasks")
        .and_then(|v| serde_json::from_value::<Vec<TodoTask>>(v.clone()).ok())
        .unwrap_or_default();
    let config = store
        .get("config")
        .and_then(|v| serde_json::from_value::<TodoConfig>(v.clone()).ok())
        .unwrap_or_else(default_config);
    let version = store
        .get("version")
        .and_then(|v| v.as_u64())
        .unwrap_or(1) as u32;

    Ok(Some(TodoStoreData {
        tasks,
        config,
        version,
    }))
}

#[tauri::command]
pub async fn save_sticky_notes(app: AppHandle, data: TodoStoreData) -> Result<(), String> {
    let store = app
        .store("sticky-notes")
        .map_err(|e| format!("Failed to open store: {e}"))?;

    store.set(
        "tasks",
        serde_json::to_value(&data.tasks).map_err(|e| format!("Serialize tasks failed: {e}"))?,
    );
    store.set(
        "config",
        serde_json::to_value(&data.config).map_err(|e| format!("Serialize config failed: {e}"))?,
    );
    store.set(
        "version",
        serde_json::to_value(&data.version).map_err(|e| format!("Serialize version failed: {e}"))?,
    );
    store
        .save()
        .map_err(|e| format!("Failed to save store: {e}"))?;

    if let Err(e) = apply_global_shortcuts_from_config(&app, &data.config.hotkeys) {
        log::warn!("Failed to update sticky notes shortcuts from config: {e}");
    }
    if let Err(e) = app.emit("sticky-notes-data-updated", ()) {
        log::warn!("Failed to emit sticky-notes-data-updated: {e}");
    }

    Ok(())
}

#[tauri::command]
pub async fn save_todo_widget_layout(
    app: AppHandle,
    position: Option<WidgetPosition>,
    width: Option<u32>,
    height: Option<u32>,
) -> Result<(), String> {
    let config = update_todo_widget_layout_in_store(&app, position, width, height)?;
    if let Err(e) = app.emit("sticky-notes-widget-layout-updated", &config.widget) {
        log::warn!("Failed to emit sticky-notes-widget-layout-updated: {e}");
    }
    Ok(())
}

#[tauri::command]
pub async fn detach_note_window(
    app: AppHandle,
    note_id: String,
    window_state: NoteWindowState,
) -> Result<(), String> {
    if note_id == "todo-widget" {
        let config = load_config_from_store(&app)?;
        let persisted_state = widget_config_to_window_state(&config.widget);
        return create_or_show_note_window(&app, &note_id, &persisted_state, true);
    }

    create_or_show_note_window(&app, &note_id, &window_state, true)
}

#[tauri::command]
pub async fn attach_note_window(
    app: AppHandle,
    note_id: String,
    skip_layout_persist: Option<bool>,
) -> Result<(), String> {
    let label = format!("note-{note_id}");
    let skip_layout_persist = skip_layout_persist.unwrap_or(false);

    if let Some(window) = app.get_webview_window(&label) {
        if note_id == "todo-widget" && !skip_layout_persist {
            let position = window
                .inner_position()
                .map(|position| WidgetPosition {
                    x: position.x,
                    y: position.y,
                })
                .ok();
            let size = window.inner_size().ok();
            let width = size.map(|size| size.width);
            let height = size.map(|size| size.height);

            let config = update_todo_widget_layout_in_store(&app, position, width, height)?;
            if let Err(e) = app.emit("sticky-notes-widget-layout-updated", &config.widget) {
                log::warn!("Failed to emit sticky-notes-widget-layout-updated: {e}");
            }
        }

        window
            .close()
            .map_err(|e| format!("Failed to close window: {e}"))?;
    }

    if let Some(manager) = app.try_state::<NoteWindowManager>() {
        manager.unregister(&note_id);
    }

    Ok(())
}

#[tauri::command]
pub async fn update_note_window_state(
    app: AppHandle,
    note_id: String,
    state: NoteWindowState,
) -> Result<(), String> {
    let label = format!("note-{note_id}");

    if let Some(window) = app.get_webview_window(&label) {
        window
            .set_always_on_top(state.is_pinned)
            .map_err(|e| format!("Failed to set always on top: {e}"))?;
        window
            .set_skip_taskbar(state.is_desktop_mode)
            .map_err(|e| format!("Failed to set skip taskbar: {e}"))?;
        window
            .set_size(tauri::Size::Physical(tauri::PhysicalSize {
                width: state.width,
                height: state.height,
            }))
            .map_err(|e| format!("Failed to set size: {e}"))?;
        window
            .set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                x: state.x,
                y: state.y,
            }))
            .map_err(|e| format!("Failed to set position: {e}"))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn set_desktop_mode(
    app: AppHandle,
    note_id: String,
    desktop_mode: bool,
) -> Result<(), String> {
    let label = format!("note-{note_id}");

    if let Some(window) = app.get_webview_window(&label) {
        window
            .set_skip_taskbar(desktop_mode)
            .map_err(|e| format!("Failed to set skip taskbar: {e}"))?;

        #[cfg(target_os = "windows")]
        if let Ok(hwnd) = window.hwnd() {
            if desktop_mode {
                let _ = embed_window_into_desktop(hwnd.0 as isize);
            } else {
                let pinned = window.is_always_on_top().unwrap_or(false);
                let _ = unembed_window_from_desktop(hwnd.0 as isize, pinned);
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn start_window_dragging(app: AppHandle, note_id: String) -> Result<(), String> {
    let label = format!("note-{note_id}");
    if let Some(window) = app.get_webview_window(&label) {
        window
            .start_dragging()
            .map_err(|e| format!("Failed to start dragging: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn toggle_pin_all_notes(app: AppHandle, pinned: bool) -> Result<(), String> {
    if let Some(manager) = app.try_state::<NoteWindowManager>() {
        for label in manager.get_all_window_labels() {
            if let Some(window) = app.get_webview_window(&label) {
                let _ = window.set_always_on_top(pinned);
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn show_hide_all_notes(app: AppHandle, visible: bool) -> Result<(), String> {
    if let Some(manager) = app.try_state::<NoteWindowManager>() {
        for label in manager.get_all_window_labels() {
            if let Some(window) = app.get_webview_window(&label) {
                if visible {
                    let _ = window.show();
                } else {
                    let _ = window.hide();
                }
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn toggle_todo_widget_visibility(app: AppHandle) -> Result<bool, String> {
    toggle_todo_widget_visibility_inner(&app)
}

#[tauri::command]
pub async fn show_todo_widget_and_focus_input(app: AppHandle) -> Result<(), String> {
    show_todo_widget(&app, true)?;
    raise_todo_widget_for_input(&app)?;
    emit_todo_widget_focus_input(&app);
    Ok(())
}

#[tauri::command]
pub async fn toggle_todo_widget_pin(app: AppHandle) -> Result<bool, String> {
    toggle_todo_widget_pin_inner(&app)
}
