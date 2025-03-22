import React, { createContext, useContext, useState, useEffect } from 'react';
import { settingsService, OrganizationSettings } from '../services/settingsService';

interface OrganizationContextType {
  settings: OrganizationSettings;
  updateSettings: (updates: Partial<OrganizationSettings>) => Promise<void>;
  isLoading: boolean;
}

const defaultSettings: OrganizationSettings = {
  name: 'Architect Hub',
  timezone: 'UTC'
};

const OrganizationContext = createContext<OrganizationContextType>({
  settings: defaultSettings,
  updateSettings: async () => {},
  isLoading: true
});

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<OrganizationSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const currentSettings = await settingsService.getSettings();
      if (currentSettings) {
        setSettings(currentSettings);
      }
    } catch (error) {
      console.error('Error loading organization settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateSettings = async (updates: Partial<OrganizationSettings>) => {
    try {
      await settingsService.updateSettings(updates);
      setSettings(prev => ({ ...prev, ...updates }));
    } catch (error) {
      console.error('Error updating organization settings:', error);
      throw error;
    }
  };

  return (
    <OrganizationContext.Provider value={{ settings, updateSettings, isLoading }}>
      {children}
    </OrganizationContext.Provider>
  );
}

export const useOrganization = () => useContext(OrganizationContext);