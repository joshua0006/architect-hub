import { useState, useEffect } from 'react';
import { TeamMember, TeamMemberType } from '../types';
import { teamService } from '../services';

export function useTeamManager(initialTeamMembers: TeamMember[]) {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(initialTeamMembers);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    loadTeamMembers();
  }, []);

  const loadTeamMembers = async () => {
    try {
      setLoading(true);
      const members = await teamService.getAll();
      setTeamMembers(members);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load team members'));
    } finally {
      setLoading(false);
    }
  };

  const createTeamMember = async (
    name: string,
    email: string,
    phone: string,
    role: string,
    type: TeamMemberType,
    projectIds: string[] = []
  ) => {
    try {
      const newMember = await teamService.create({
        name,
        email,
        phone,
        role,
        type,
        projectIds,
      });
      setTeamMembers(prev => [...prev, newMember]);
      return newMember;
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to create team member');
    }
  };

  const updateTeamMember = async (
    id: string,
    updates: Partial<Omit<TeamMember, 'id'>>
  ) => {
    try {
      await teamService.update(id, updates);
      setTeamMembers(prev =>
        prev.map(member =>
          member.id === id ? { ...member, ...updates } : member
        )
      );
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to update team member');
    }
  };

  const deleteTeamMember = async (id: string) => {
    try {
      await teamService.delete(id);
      setTeamMembers(prev => prev.filter(member => member.id !== id));
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to delete team member');
    }
  };

  const assignToProject = async (memberId: string, projectId: string) => {
    try {
      await teamService.assignToProject(memberId, projectId);
      setTeamMembers(prev =>
        prev.map(member =>
          member.id === memberId
            ? {
                ...member,
                projectIds: member.projectIds.includes(projectId)
                  ? member.projectIds
                  : [...member.projectIds, projectId],
              }
            : member
        )
      );
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to assign to project');
    }
  };

  const removeFromProject = async (memberId: string, projectId: string) => {
    try {
      await teamService.removeFromProject(memberId, projectId);
      setTeamMembers(prev =>
        prev.map(member =>
          member.id === memberId
            ? {
                ...member,
                projectIds: member.projectIds.filter(id => id !== projectId),
              }
            : member
        )
      );
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to remove from project');
    }
  };

  return {
    teamMembers,
    loading,
    error,
    createTeamMember,
    updateTeamMember,
    deleteTeamMember,
    assignToProject,
    removeFromProject,
    refreshTeamMembers: loadTeamMembers,
  };
}