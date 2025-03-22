import { UserRole } from './index';

export interface UserProfile {
  photoURL: string | null;
  bio: string;
  title: string;
  phone: string;
  location: string;
  timezone: string;
  notifications: {
    email: boolean;
    push: boolean;
  };
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  projectIds: string[];
  profile: UserProfile;
  metadata: {
    lastLogin: string;
    createdAt: string;
    updatedAt: string;
  };
}

export interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

export interface AuthContextType extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  updateProfilePicture: (file: File) => Promise<void>;
  canAssignTasks: () => boolean;
  canUpdateMilestones: () => boolean;
  canUpdateTaskStatus: (taskId: string) => boolean;
  canUploadDocuments: () => boolean;
  canComment: () => boolean;
}