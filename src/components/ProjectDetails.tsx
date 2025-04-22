import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Project, Task } from "../types";
import CircularProgress from "./CircularProgress";
import TaskSummary from "./TaskSummary";
import MilestoneList from "./MilestoneList";
import { Calendar, Users, Building2, Edit, MapPin, UserPlus, Shield } from "lucide-react";
import { useMilestoneManager } from "../hooks/useMilestoneManager";
import { calculateMilestoneProgress } from "../utils/progressCalculator";
import EditProject from "./EditProject";
import { useAuth } from "../contexts/AuthContext";
import axios from "axios";
import { userService } from "../services/userService";
import { projectService } from "../services";

interface ProjectDetailsProps {
  project: Project;
  tasks: Task[];
  onProjectUpdate?: () => void;
}

export default function ProjectDetails({
  project,
  tasks,
  onProjectUpdate,
}: ProjectDetailsProps) {
  const [showEditProject, setShowEditProject] = useState(false);
  const { user, canEditProject } = useAuth();
  const [availablePeople, setAvailablePeople] = useState([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [loadingTeamMembers, setLoadingTeamMembers] = useState(false);
  const [showAddMemberDialog, setShowAddMemberDialog] = useState(false);

  const { milestones, createMilestone, updateMilestone, deleteMilestone, reorderMilestones } =
    useMilestoneManager(project.id);

  const progress = calculateMilestoneProgress(milestones);

  // Get location string from project metadata
  const location =
    typeof project.metadata?.location === "string"
      ? project.metadata.location
      : project.metadata?.location
      ? `${project.metadata.location.city || ""}, ${
          project.metadata.location.state || ""
        }, ${project.metadata.location.country || ""}`.replace(
          /^[, ]+|[, ]+$/g,
          ""
        )
      : "Location not specified";

  // Load team members for the project
  const loadTeamMembers = async () => {
    if (!project.teamMemberIds?.length) {
      setTeamMembers([]);
      return;
    }
    
    try {
      setLoadingTeamMembers(true);
      const members = [];
      
      for (const userId of project.teamMemberIds) {
        try {
          const userData = await userService.getById(userId);
          if (userData) {
            members.push(userData);
          }
        } catch (err) {
          console.error(`Error loading user ${userId}:`, err);
        }
      }
      
      setTeamMembers(members);
    } catch (error) {
      console.error("Error loading team members:", error);
    } finally {
      setLoadingTeamMembers(false);
    }
  };

  const fetchAvailablePeople = async () => {
    try {
      const response = await axios.get("/api/people/available");
      setAvailablePeople(response.data);
    } catch (error) {
      console.error("Error fetching available people:", error);
    }
  };

  useEffect(() => {
    fetchAvailablePeople();
    loadTeamMembers();
  }, [project.teamMemberIds]);

  // Determine if current user is in the project
  const isCurrentUserInProject = user?.id && project.teamMemberIds?.includes(user.id);

  return (
    <div className="p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 flex justify-between items-start"
      >
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            {project.name}
          </h1>
          <p className="text-gray-500">{project.client}</p>
        </div>

        {canEditProject() && (
          <button
            onClick={() => setShowEditProject(true)}
            className="px-4 py-2 text-sm text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors flex items-center space-x-2"
          >
            <Edit className="w-4 h-4" />
            <span>Edit Project</span>
          </button>
        )}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Progress Section with Milestones */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-xl p-6 shadow-sm"
        >
          <h2 className="text-lg font-medium text-gray-900 mb-6">
            Project Progress
          </h2>
          <div className="flex flex-col items-center">
            <CircularProgress progress={progress} milestones={milestones} />
            <div className="mt-4 text-center">
              <p className="text-sm text-gray-500">
                {milestones.filter((m) => m.status === "completed").length} of{" "}
                {milestones.length} milestones completed
              </p>
            </div>
          </div>

          <TaskSummary tasks={tasks} projectId={project.id} />
        </motion.div>

        {/* Project Details Section */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-xl p-6 shadow-sm"
        >
          <h2 className="text-lg font-medium text-gray-900 mb-6">
            Project Details
          </h2>
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-primary-50 rounded-lg">
                <Building2 className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Industry</p>
                <p className="font-medium">{project.metadata?.industry}</p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className="p-2 bg-primary-50 rounded-lg">
                <Calendar className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Timeline</p>
                <p className="font-medium">
                  {new Date(project.startDate).toLocaleDateString()} -{" "}
                  {new Date(project.endDate).toLocaleDateString()}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className="p-2 bg-primary-50 rounded-lg">
                <Users className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Project Type</p>
                <p className="font-medium">{project.metadata?.projectType}</p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className="p-2 bg-primary-50 rounded-lg">
                <MapPin className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Location</p>
                <p className="font-medium">{location}</p>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-100">
              <h3 className="text-sm font-medium text-gray-900 mb-2">Budget</h3>
              <p className="text-gray-600">{project.metadata?.budget}</p>
            </div>

            {project.metadata?.scope && (
              <div className="mt-6 pt-6 border-t border-gray-100">
                <h3 className="text-sm font-medium text-gray-900 mb-2">
                  Scope
                </h3>
                <p className="text-gray-600">{project.metadata.scope}</p>
              </div>
            )}

            {/* Team Members Section */}
            <div className="mt-6 pt-6 border-t border-gray-100">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-medium text-gray-900">
                  Team Members ({project.teamMemberIds?.length || 0})
                </h3>
                {user?.role === 'Staff' && (
                  <button 
                    onClick={() => setShowAddMemberDialog(true)}
                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center"
                  >
                    <UserPlus className="w-3 h-3 mr-1" />
                    Add Member
                  </button>
                )}
              </div>
              
              {loadingTeamMembers ? (
                <p className="text-sm text-gray-500">Loading team members...</p>
              ) : teamMembers.length > 0 ? (
                <div className="space-y-2">
                  {teamMembers.map(member => (
                    <div key={member.id} className="flex items-center justify-between py-1">
                      <div className="flex items-center">
                        {member.profile?.photoURL ? (
                          <img 
                            src={member.profile.photoURL} 
                            alt={member.displayName}
                            className="w-6 h-6 rounded-full mr-2"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-gray-200 mr-2 flex items-center justify-center text-xs text-gray-600">
                            {member.displayName[0]}
                          </div>
                        )}
                        <span className="text-sm">{member.displayName}</span>
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                        {member.role}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 italic">No team members assigned yet</p>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Milestones Section */}
      <MilestoneList
        projectId={project.id}
        milestones={milestones}
        onCreateMilestone={createMilestone}
        onUpdateMilestone={updateMilestone}
        onDeleteMilestone={deleteMilestone}
        onReorderMilestones={reorderMilestones}
      />

      {/* Edit Project Modal */}
      {showEditProject && (
        <EditProject
          project={project}
          onSuccess={() => {
            setShowEditProject(false);
            // Project updates will be handled automatically through Firebase real-time
            // Still call onProjectUpdate for any UI-specific refreshes needed
            onProjectUpdate?.();
          }}
          onCancel={() => setShowEditProject(false)}
        />
      )}
    </div>
  );
}
