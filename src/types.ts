// Document types
export interface DocumentComment {
  id: string;
  documentId: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: string;
  updatedAt?: string;
  replyTo?: string;
}

export interface Document {
  id: string;
  projectId: string;
  name: string;
  type: 'pdf' | 'dwg' | 'other';
  folderId: string;
  version: number;
  dateModified: string;
  url: string;
  comments?: DocumentComment[];
  metadata?: {
    size?: number;
    contentType?: string;
    originalFilename?: string;
  };
}

// Project types
export interface Project {
  id: string;
  name: string;
  client: string;
  status: 'active' | 'done' | 'archived';
  progress: number;
  startDate: string;
  endDate: string;
  teamMemberIds: string[];
  metadata?: {
    industry: string;
    projectType: string;
    location: {
      city: string;
      state: string;
      country: string;
    };
    budget: string;
    scope: string;
    archivedAt?: string;
    lastMilestoneUpdate?: string;
  };
}

// Folder types
export interface Folder {
  id: string;
  projectId: string;
  name: string;
  parentId?: string;
  metadata?: {
    path?: string;
    level?: number;
    documentCount?: number;
    lastUpdated?: string;
  };
}

// Task types
export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  assignedTo: string;
  dueDate: string;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'in-progress' | 'completed';
  category: string;
  metadata?: {
    createdBy: string;
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
  };
}

// Team member types
export type TeamMemberType = 'Staff' | 'Client' | 'Contractor';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  type: TeamMemberType;
  projectIds: string[];
  displayName?: string;
  profile?: {
    photoURL?: string;
    title?: string;
    location?: string;
  };
  metadata?: {
    lastLogin?: string;
  };
}

// Milestone types
export interface Milestone {
  id: string;
  projectId: string;
  title: string;
  description: string;
  dueDate: string;
  weight: number;
  status: 'pending' | 'in-progress' | 'completed';
  metadata?: {
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
  };
}

// Task category types
export interface TaskCategory {
  id: string;
  name: string;
  color: string;
  isDefault?: boolean;
}

// User role type
export type UserRole = 'Staff' | 'Client' | 'Contractor' | 'Admin';

// User types
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

export interface ShareToken {
  id: string;
  resourceId: string;
  type: 'file' | 'folder';
  expiresAt: Date | firebase.firestore.Timestamp;
  permissions: string[];
  creatorId: string;
  createdAt: Date;
}