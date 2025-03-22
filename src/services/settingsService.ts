import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { TaskCategory } from '../types';

const SETTINGS_DOC = 'settings/organization';

export interface OrganizationSettings {
  name: string;
  timezone: string;
  taskCategories: TaskCategory[];
  updatedAt?: string;
}

const DEFAULT_CATEGORIES: TaskCategory[] = [
  { id: 'admin', name: 'Admin', color: '#3b82f6', isDefault: true },
  { id: 'design', name: 'Design', color: '#10b981', isDefault: true },
  { id: 'construction', name: 'Construction', color: '#f59e0b', isDefault: true },
  { id: 'closeout', name: 'Closeout', color: '#6366f1', isDefault: true },
  { id: 'other', name: 'Other', color: '#6b7280', isDefault: true }
];

export const settingsService = {
  async getSettings(): Promise<OrganizationSettings | null> {
    const docRef = doc(db, SETTINGS_DOC);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      // Initialize with default settings if none exist
      const defaultSettings: OrganizationSettings = {
        name: 'Architect Hub',
        timezone: 'UTC',
        taskCategories: DEFAULT_CATEGORIES
      };
      await setDoc(docRef, {
        ...defaultSettings,
        updatedAt: serverTimestamp()
      });
      return defaultSettings;
    }
    return docSnap.data() as OrganizationSettings;
  },

  async updateSettings(updates: Partial<OrganizationSettings>): Promise<void> {
    const docRef = doc(db, SETTINGS_DOC);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      await updateDoc(docRef, {
        ...updates,
        updatedAt: serverTimestamp()
      });
    } else {
      await setDoc(docRef, {
        ...updates,
        updatedAt: serverTimestamp()
      });
    }
  },

  async updateTaskCategories(categories: TaskCategory[]): Promise<void> {
    const docRef = doc(db, SETTINGS_DOC);
    await updateDoc(docRef, {
      taskCategories: categories,
      updatedAt: serverTimestamp()
    });
  }
};