const SETTINGS_STORAGE_KEY = 'liao-tools-settings';

export interface AppSettings {
  autoUpdate: boolean;
  notifications: boolean;
  saveHistory: boolean;
}

const defaultSettings: AppSettings = {
  autoUpdate: true,
  notifications: true,
  saveHistory: true,
};

export const loadSettings = (): AppSettings => {
  try {
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (saved) {
      return { ...defaultSettings, ...JSON.parse(saved) };
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
  return defaultSettings;
};

export const saveSettings = (settings: AppSettings): void => {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
};
