import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  writeBatch,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { TeamMember } from '../types';

const COLLECTION = 'team_members';

export const teamService = {
  // Get all team members
  async getAll(): Promise<TeamMember[]> {
    const snapshot = await getDocs(collection(db, COLLECTION));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TeamMember));
  },

  // Get team members by project ID
  async getByProjectId(projectId: string): Promise<TeamMember[]> {
    const q = query(
      collection(db, COLLECTION),
      where('projectIds', 'array-contains', projectId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TeamMember));
  },

  // Get a single team member
  async getById(id: string): Promise<TeamMember | null> {
    const docRef = doc(db, COLLECTION, id);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as TeamMember : null;
  },

  // Create a team member
  async create(member: Omit<TeamMember, 'id'>): Promise<TeamMember> {
    // Validate required fields
    if (!member.name || !member.email || !member.role || !member.type) {
      throw new Error('Missing required fields');
    }

    const docRef = await addDoc(collection(db, COLLECTION), {
      ...member,
      projectIds: member.projectIds || [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      metadata: {
        lastActive: new Date().toISOString(),
        status: 'active',
        invitationStatus: 'pending'
      }
    });

    // If projects are specified, update project team members
    if (member.projectIds?.length) {
      const batch = writeBatch(db);
      for (const projectId of member.projectIds) {
        const projectRef = doc(db, 'projects', projectId);
        batch.update(projectRef, {
          teamMemberIds: arrayUnion(docRef.id)
        });
      }
      await batch.commit();
    }

    return { id: docRef.id, ...member };
  },

  // Update a team member
  async update(id: string, updates: Partial<TeamMember>): Promise<void> {
    const docRef = doc(db, COLLECTION, id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      throw new Error('Team member not found');
    }

    const currentMember = { id: docSnap.id, ...docSnap.data() } as TeamMember;
    
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp(),
      'metadata.lastModified': new Date().toISOString()
    });

    // Handle project assignments if they've changed
    if (updates.projectIds && updates.projectIds !== currentMember.projectIds) {
      const batch = writeBatch(db);
      
      // Remove from old projects
      const projectsToRemove = currentMember.projectIds.filter(
        id => !updates.projectIds?.includes(id)
      );
      
      // Add to new projects
      const projectsToAdd = updates.projectIds.filter(
        id => !currentMember.projectIds.includes(id)
      );

      // Update project documents
      for (const projectId of projectsToRemove) {
        const projectRef = doc(db, 'projects', projectId);
        batch.update(projectRef, {
          teamMemberIds: arrayRemove(id)
        });
      }

      for (const projectId of projectsToAdd) {
        const projectRef = doc(db, 'projects', projectId);
        batch.update(projectRef, {
          teamMemberIds: arrayUnion(id)
        });
      }

      await batch.commit();
    }
  },

  // Delete a team member
  async delete(id: string): Promise<void> {
    const docRef = doc(db, COLLECTION, id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const member = { id: docSnap.id, ...docSnap.data() } as TeamMember;
      
      // Remove member from all assigned projects
      const batch = writeBatch(db);
      for (const projectId of member.projectIds) {
        const projectRef = doc(db, 'projects', projectId);
        batch.update(projectRef, {
          teamMemberIds: arrayRemove(id)
        });
      }
      
      // Delete the team member document
      batch.delete(docRef);
      await batch.commit();
    }
  },

  // Assign to project
  async assignToProject(memberId: string, projectId: string): Promise<void> {
    const batch = writeBatch(db);
    
    // Update user document
    const userRef = doc(db, 'users', memberId);
    batch.update(userRef, {
      projectIds: arrayUnion(projectId),
      updatedAt: serverTimestamp()
    });

    // Update project document
    const projectRef = doc(db, 'projects', projectId);
    batch.update(projectRef, {
      teamMemberIds: arrayUnion(memberId),
      updatedAt: serverTimestamp()
    });

    await batch.commit();
  },

  // Remove from project
  async removeFromProject(memberId: string, projectId: string): Promise<void> {
    const batch = writeBatch(db);
    
    // Update user document
    const userRef = doc(db, 'users', memberId);
    batch.update(userRef, {
      projectIds: arrayRemove(projectId),
      updatedAt: serverTimestamp()
    });

    // Update project document
    const projectRef = doc(db, 'projects', projectId);
    batch.update(projectRef, {
      teamMemberIds: arrayRemove(memberId),
      updatedAt: serverTimestamp()
    });

    await batch.commit();
  },

  // Bulk assign members to project
  async bulkAssignToProject(memberIds: string[], projectId: string): Promise<void> {
    const batch = writeBatch(db);
    
    // Update each user document
    memberIds.forEach(memberId => {
      const userRef = doc(db, 'users', memberId);
      batch.update(userRef, {
        projectIds: arrayUnion(projectId),
        updatedAt: serverTimestamp()
      });
    });

    // Update project document
    const projectRef = doc(db, 'projects', projectId);
    batch.update(projectRef, {
      teamMemberIds: arrayUnion(...memberIds),
      updatedAt: serverTimestamp()
    });

    await batch.commit();
  },

  // Bulk remove members from project
  async bulkRemoveFromProject(memberIds: string[], projectId: string): Promise<void> {
    const batch = writeBatch(db);
    
    // Update each user document
    memberIds.forEach(memberId => {
      const userRef = doc(db, 'users', memberId);
      batch.update(userRef, {
        projectIds: arrayRemove(projectId),
        updatedAt: serverTimestamp()
      });
    });

    // Update project document
    const projectRef = doc(db, 'projects', projectId);
    batch.update(projectRef, {
      teamMemberIds: arrayRemove(...memberIds),
      updatedAt: serverTimestamp()
    });

    await batch.commit();
  }
};