import React, { useState, useEffect } from "react";
import {
  Users,
  UserPlus,
  X,
  Search,
  Check,
  Mail,
  Phone,
  MapPin,
  MoreVertical,
  UserMinus,
} from "lucide-react";
import { User, Project } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { formatDateToTimezone } from "../utils/dateUtils";
import { useOrganization } from "../contexts/OrganizationContext";
import { userService } from "../services/userService";
import { projectService } from "../services/projectService";
import { motion, AnimatePresence } from "framer-motion";

interface TeamListProps {
  projects: Project[];
  selectedProject?: Project;
  onProjectsChange?: () => void;
  teamMembers?: User[];
}

export default function TeamList({
  projects,
  selectedProject,
  onProjectsChange,
  teamMembers,
}: TeamListProps) {
  const { user } = useAuth();
  const { settings } = useOrganization();
  const [showUserSelection, setShowUserSelection] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [projectMembers, setProjectMembers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [showMemberMenu, setShowMemberMenu] = useState<string | null>(null);

  // Load project members when project changes
  useEffect(() => {
    if (selectedProject) {
      loadProjectMembers();
    } else {
      setProjectMembers([]);
    }
  }, [selectedProject]);

  const loadProjectMembers = async () => {
    if (!selectedProject) return;

    try {
      setLoading(true);
      const members = await userService.getUsersByProject(selectedProject.id);
      setProjectMembers(members);
    } catch (error) {
      console.error("Error loading project members:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableUsers = async () => {
    if (!selectedProject) return;

    try {
      setLoading(true);
      const allUsers = await userService.getAllUsers();
      const available = allUsers.filter(
        (user) => !selectedProject.teamMemberIds?.includes(user.id)
      );
      setAvailableUsers(available);
    } catch (error) {
      console.error("Error loading users:", error);
    } finally {
      setLoading(false);
    }
  };

  // Add this effect to refresh available users when project members change
  useEffect(() => {
    if (showUserSelection && selectedProject) {
      loadAvailableUsers();
    }
  }, [showUserSelection, selectedProject, projectMembers]); // Add projectMembers as dependency

  const groupedMembers = React.useMemo(() => {
    const groups = {
      Staff: [] as User[],
      Client: [] as User[],
      Contractor: [] as User[],
    };

    projectMembers.forEach((member) => {
      if (member.role === 'Admin') {
        // Add Admin users to the Staff group
        groups.Staff.push(member);
      } else if (member.role in groups) {
        groups[member.role as keyof typeof groups].push(member);
      }
    });

    Object.values(groups).forEach((group) => {
      group.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
    });

    return groups;
  }, [projectMembers]);

  const getTypeColor = (role: keyof typeof groupedMembers) => {
    switch (role) {
      case "Staff":
        return "bg-blue-100 text-blue-800";
      case "Client":
        return "bg-green-100 text-green-800";
      case "Contractor":
        return "bg-purple-100 text-purple-800";
    }
  };

  const toggleUserSelection = (userId: string) => {
    const newSelected = new Set(selectedUsers);
    newSelected.has(userId)
      ? newSelected.delete(userId)
      : newSelected.add(userId);
    setSelectedUsers(newSelected);
  };

  const handleAddSelectedUsers = async () => {
    if (!selectedProject) return;

    try {
      setLoading(true);
      await projectService.addUsersToProject(
        selectedProject.id,
        Array.from(selectedUsers)
      );

      // Refresh project data
      await onProjectsChange?.();

      // Refresh project members
      await loadProjectMembers();

      // No need to explicitly call loadAvailableUsers here since it will be triggered by the effect

      setShowUserSelection(false);
      setSelectedUsers(new Set());
      setSearchQuery("");
    } catch (error) {
      console.error("Error adding users to project:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!selectedProject) return;

    try {
      setLoading(true);
      await projectService.removeUsersFromProject(selectedProject.id, [
        memberId,
      ]);

      // Refresh project data
      await onProjectsChange?.();

      // Refresh project members
      await loadProjectMembers();

      // No need to explicitly call loadAvailableUsers here since it will be triggered by the effect

      setShowMemberMenu(null);
    } catch (error) {
      console.error("Error removing user from project:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = availableUsers.filter((user) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      (user.displayName || '').toLowerCase().includes(searchLower) ||
      (user.email || '').toLowerCase().includes(searchLower)
    );
  });

  // Update loading skeletons component to match the team layout
  const LoadingSkeleton = () => (
    <div className="space-y-8">
      {/* Simulate 3 role groups */}
      {[1, 2, 3].map((groupIndex) => (
        <div key={groupIndex} className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900 flex items-center space-x-2">
            <div className="h-7 w-24 bg-gray-200 rounded-full animate-pulse" />
            <div className="h-5 w-8 bg-gray-200 rounded animate-pulse" />
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Simulate 3 member cards per group */}
            {[1, 2].map((cardIndex) => (
              <div
                key={cardIndex}
                className="p-4 bg-white border border-gray-200 rounded-lg animate-pulse"
              >
                <div className="flex items-start space-x-4">
                  <div className="w-12 h-12 bg-gray-200 rounded-full flex-shrink-0" />
                  <div className="flex-1 min-w-0 space-y-3">
                    {/* Name and title */}
                    <div className="space-y-2">
                      <div className="h-4 bg-gray-200 rounded w-3/4" />
                      <div className="h-3 bg-gray-200 rounded w-1/2" />
                    </div>

                    {/* Contact info */}
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 bg-gray-200 rounded" />
                        <div className="h-3 bg-gray-200 rounded flex-1" />
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 bg-gray-200 rounded" />
                        <div className="h-3 bg-gray-200 rounded flex-1" />
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 bg-gray-200 rounded" />
                        <div className="h-3 bg-gray-200 rounded flex-1" />
                      </div>
                    </div>

                    {/* Last active */}
                    <div className="pt-2 mt-2 border-t border-gray-100">
                      <div className="h-3 bg-gray-200 rounded w-2/3" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <Users className="w-6 h-6 text-gray-700" />
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Project Team
            </h2>
            {selectedProject && (
              <p className="text-sm text-gray-500">{selectedProject.name}</p>
            )}
          </div>
        </div>
        {selectedProject && (
          (user?.role === 'Staff' || user?.role === 'Admin') && (
            <button
              onClick={() => setShowUserSelection(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add Person</span>
            </button>
          )
        )}
      </div>

      <AnimatePresence>
        {showUserSelection && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  Add Team Members
                </h3>
                <button
                  onClick={() => setShowUserSelection(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search users..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto min-h-0">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredUsers.map((user) => (
                      <div
                        key={user.id}
                        onClick={() => toggleUserSelection(user.id)}
                        className={`flex items-center p-3 rounded-lg cursor-pointer transition-colors ${
                          selectedUsers.has(user.id)
                            ? "bg-blue-50 border-blue-200"
                            : "hover:bg-gray-50 border-gray-200"
                        } border`}
                      >
                        <div className="flex-1 flex items-center space-x-3">
                          <div className="flex-shrink-0">
                            {user.profile?.photoURL ? (
                              <img
                                src={user.profile.photoURL}
                                alt={user.displayName}
                                className="w-10 h-10 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                                <span className="text-lg font-medium text-gray-600">
                                  {(user.displayName || 'U')[0].toUpperCase()}
                                </span>
                              </div>
                            )}
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-900">
                              {user.displayName}
                            </h4>
                            <p className="text-sm text-gray-500">
                              {user.email}
                            </p>
                          </div>
                        </div>
                        <div
                          className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                            selectedUsers.has(user.id)
                              ? "bg-blue-500 border-blue-500"
                              : "border-gray-300"
                          }`}
                        >
                          {selectedUsers.has(user.id) && (
                            <Check className="w-3 h-3 text-white" />
                          )}
                        </div>
                      </div>
                    ))}
                    {filteredUsers.length === 0 && (
                      <p className="text-center text-gray-500 py-4">
                        No users found
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-gray-200 flex justify-end space-x-3">
                <button
                  onClick={() => setShowUserSelection(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddSelectedUsers}
                  disabled={selectedUsers.size === 0 || loading}
                  className="px-4 py-2 text-sm text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Add Selected ({selectedUsers.size})</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {selectedProject ? (
        loading ? (
          <LoadingSkeleton />
        ) : projectMembers.length > 0 ? (
          <div className="space-y-8">
            {(
              Object.keys(groupedMembers) as Array<keyof typeof groupedMembers>
            ).map(
              (role) =>
                groupedMembers[role].length > 0 && (
                  <div key={role} className="space-y-4">
                    <h3 className="text-lg font-medium text-gray-900 flex items-center space-x-2">
                      <span
                        className={`inline-block px-3 py-1 text-sm rounded-full ${getTypeColor(
                          role
                        )}`}
                      >
                        {role}
                      </span>
                      <span className="text-gray-500 text-sm">
                        ({groupedMembers[role].length})
                      </span>
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {groupedMembers[role].map((member) => (
                        <div
                          key={member.id}
                          className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow relative"
                        >
                          <div className="absolute top-4 right-4">
                            {/* Only show menu for staff users */}
                            {(user?.role === 'Staff' || user?.role === 'Admin') && (
                              <div className="relative">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowMemberMenu(
                                      showMemberMenu === member.id
                                        ? null
                                        : member.id
                                    );
                                  }}
                                  className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                                >
                                  <MoreVertical className="w-4 h-4 text-gray-400" />
                                </button>

                                <AnimatePresence>
                                  {showMemberMenu === member.id && (
                                    <motion.div
                                      initial={{ opacity: 0, scale: 0.95 }}
                                      animate={{ opacity: 1, scale: 1 }}
                                      exit={{ opacity: 0, scale: 0.95 }}
                                      className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10 border border-gray-200"
                                    >
                                      {/* Only staff can remove users from projects */}
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleRemoveMember(member.id);
                                        }}
                                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center space-x-2"
                                      >
                                        <UserMinus className="w-4 h-4" />
                                        <span>Remove from Project</span>
                                      </button>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            )}
                          </div>
                          <div className="flex items-start space-x-4">
                            <div className="flex-shrink-0">
                              {member.profile?.photoURL ? (
                                <img
                                  src={member.profile.photoURL}
                                  alt={member.displayName}
                                  className="w-12 h-12 rounded-full object-cover"
                                />
                              ) : (
                                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                                  <span className="text-lg font-medium text-gray-600">
                                    {(member.displayName || 'U')[0].toUpperCase()}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0 space-y-2">
                              <div>
                                <h3 className="text-base font-semibold text-gray-900 truncate">
                                  {member.displayName}
                                </h3>
                                {member.profile?.title && (
                                  <p className="text-sm text-gray-500 mt-1">
                                    {member.profile.title}
                                  </p>
                                )}
                              </div>

                              <div className="space-y-1">
                                <div className="flex items-center text-sm text-gray-600">
                                  <Mail className="w-4 h-4 mr-2 text-gray-400" />
                                  <span>{member.email}</span>
                                </div>

                                {member.profile?.phone && (
                                  <div className="flex items-center text-sm text-gray-600">
                                    <Phone className="w-4 h-4 mr-2 text-gray-400" />
                                    <span>{member.profile.phone}</span>
                                  </div>
                                )}

                                {member.profile?.location && (
                                  <div className="flex items-center text-sm text-gray-600">
                                    <MapPin className="w-4 h-4 mr-2 text-gray-400" />
                                    <span>{member.profile.location}</span>
                                  </div>
                                )}
                              </div>

                              {member.metadata?.lastLogin ? (
                                <div className="pt-2 mt-2 border-t border-gray-100">
                                  <p className="text-xs text-gray-500">
                                    Last active:{" "}
                                    {formatDateToTimezone(
                                      new Date(
                                        typeof member.metadata.lastLogin === 'object' && 
                                        'seconds' in member.metadata.lastLogin ? 
                                          (member.metadata.lastLogin as {seconds: number}).seconds * 1000 : 
                                          member.metadata.lastLogin
                                      ),
                                      settings.timezone
                                    )}
                                  </p>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
            )}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500">
              No team members assigned to this project yet.
            </p>
            <button
              onClick={() => setShowUserSelection(true)}
              className="mt-4 inline-flex items-center space-x-2 px-4 py-2 text-sm text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add team members</span>
            </button>
          </div>
        )
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500">
            Select a project to view team members.
          </p>
        </div>
      )}
    </div>
  );
}
