fn main() {
    // Keep the Windows executable (and the shortcuts created by the installer)
    // bound to the same multi-resolution ICO as the Tauri bundle.
    let attrs = tauri_build::Attributes::new().windows_attributes(
        tauri_build::WindowsAttributes::new().window_icon_path("icons/icon.ico"),
    );
    tauri_build::try_build(attrs).expect("failed to build Tauri resources");
}
