import { FolderAccessPermission, UserRole } from "./contexts/AuthContext";

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
  mentions?: string[];
  userPhotoURL?: string | null;
  position?: {
    x: number;
    y: number;
    pageNumber: number;
  };
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
    access?: 'ALL' | 'STAFF_ONLY' | 'CONTRACTORS_WRITE' | 'CLIENTS_READ';
  };
}

export interface DocumentVersion {
  id: string;
  version: number;
  url: string;
  uploadedAt: string;
  accessible?: boolean;
  metadata: {
    originalFilename: string;
    contentType: string;
    size: number;
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
    access?: FolderAccessPermission
  };
}

// Task types
export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  assignedTo: string[];
  dueDate: string;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'in-progress' | 'completed';
  category: string;
  parentTaskId?: string; // Reference to parent task if this is a subtask
  subtasks?: Task[]; // Array of subtasks
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
  groupIds: string[];
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
  canEditDocuments: () => boolean;
  canDeleteDocuments: () => boolean;
  canShareDocuments: () => boolean;
  canComment: () => boolean;
  canManageTeam: () => boolean;
  canEditProject: () => boolean;
  canEditTask: () => boolean;
  canDeleteTask: () => boolean;
}

export interface ShareToken {
  id: string;
  resourceId: string;
  type: 'file' | 'folder';
  expiresAt: Date | any;
  permissions: string[];
  creatorId: string;
  createdAt: Date;
}

// Permission types for RBAC
export type PermissionAction = 'view' | 'edit' | 'delete' | 'manage';
export type PermissionResource = 'project' | 'folder' | 'file' | 'team';

export interface Permission {
  id: string;
  action: PermissionAction;
  resource: PermissionResource;
  resourceId: string; // Specific project/folder/file ID or '*' for all
  description: string;
}

export interface UserGroup {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  userIds: string[];
  createdBy: string;
  metadata: {
    createdAt: string;
    updatedAt: string;
  };
}

// Access log for audit trail
export interface AccessLog {
  id: string;
  userId: string;
  userName: string;
  resourceType: PermissionResource;
  resourceId: string;
  resourceName: string;
  action: PermissionAction;
  timestamp: string;
  ipAddress?: string;
  userAgent?: string;
}

// Folder Permission types
export interface FolderPermission {
  id: string;
  folderId: string;
  projectId: string;
  accessLevel: 'ALL' | 'STAFF_ONLY';
  customAccessUsers?: string[]; // User IDs with custom access
  overrideDefault: boolean; // Whether this overrides the default template permissions
  createdBy: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt?: string;
}