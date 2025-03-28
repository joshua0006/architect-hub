import { useState, useEffect } from 'react';
import { Milestone } from '../types';
import { Flag, Calendar, Pencil, Trash2, Plus, X, ChevronDown, GripVertical } from 'lucide-react';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';

interface MilestoneListProps {
  projectId: string;
  milestones: Milestone[];
  onCreateMilestone: (title: string, description: string, dueDate: string, weight: number) => void;
  onUpdateMilestone: (id: string, updates: Partial<Omit<Milestone, 'id' | 'projectId'>>) => void;
  onDeleteMilestone: (id: string) => void;
  onReorderMilestones?: (newOrder: Milestone[]) => void;
}

export default function MilestoneList({
  projectId,
  milestones,
  onCreateMilestone,
  onUpdateMilestone,
  onDeleteMilestone,
  onReorderMilestones
}: MilestoneListProps) {
  const { user, canUpdateMilestones } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
  const [showStatusMenu, setShowStatusMenu] = useState<string | null>(null);
  const [orderedMilestones, setOrderedMilestones] = useState<Milestone[]>(milestones);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    dueDate: '',
    weight: 0
  });

  // Update ordered milestones when parent milestones change
  useEffect(() => {
    setOrderedMilestones(milestones);
  }, [milestones]);

  // Handle reordering of milestones
  const handleReorder = (newOrder: Milestone[]) => {
    setOrderedMilestones(newOrder);
    if (onReorderMilestones) {
      onReorderMilestones(newOrder);
    }
  };

  // Calculate total weight of existing milestones
  const totalExistingWeight = milestones
    .filter(m => !editingMilestone || m.id !== editingMilestone.id)
    .reduce((sum, m) => sum + m.weight, 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { title, description, dueDate, weight } = formData;

    // Validate total weight doesn't exceed 100%
    const newTotalWeight = totalExistingWeight + weight;
    if (newTotalWeight > 100) {
      alert(`Total milestone weights cannot exceed 100%. Current total: ${totalExistingWeight}%`);
      return;
    }

    if (editingMilestone) {
      onUpdateMilestone(editingMilestone.id, {
        title,
        description,
        dueDate,
        weight
      });
    } else {
      onCreateMilestone(title, description, dueDate, weight);
    }

    setShowForm(false);
    setEditingMilestone(null);
    setFormData({
      title: '',
      description: '',
      dueDate: '',
      weight: 0
    });
  };

  const startEdit = (milestone: Milestone) => {
    setEditingMilestone(milestone);
    setFormData({
      title: milestone.title,
      description: milestone.description,
      dueDate: milestone.dueDate,
      weight: milestone.weight
    });
    setShowForm(true);
  };

  const getMilestoneStatusColor = (status: Milestone['status']) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'in-progress':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleStatusChange = (milestone: Milestone, newStatus: Milestone['status']) => {
    onUpdateMilestone(milestone.id, { status: newStatus });
    setShowStatusMenu(null);
  };

  const statusOptions: { value: Milestone['status']; label: string; color: string }[] = [
    { value: 'pending', label: 'Pending', color: 'bg-gray-100 text-gray-800' },
    { value: 'in-progress', label: 'In Progress', color: 'bg-blue-100 text-blue-800' },
    { value: 'completed', label: 'Completed', color: 'bg-green-100 text-green-800' }
  ];

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-medium text-gray-900">Project Milestones</h2>
        {/* Only show Add Milestone button for staff and contractors */}
        {canUpdateMilestones() && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Milestone</span>
          </button>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-lg p-6 w-full max-w-md"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                {editingMilestone ? 'Edit Milestone' : 'Add Milestone'}
              </h3>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingMilestone(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Due Date
                </label>
                <input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Weight (%)
                </label>
                <div className="space-y-1">
                  <input
                    type="number"
                    min="1"
                    max={editingMilestone ? 
                      100 - totalExistingWeight + editingMilestone.weight : 
                      100 - totalExistingWeight}
                    value={formData.weight}
                    onChange={(e) => {
                      const value = Math.max(1, Math.min(parseInt(e.target.value) || 0, 100));
                      setFormData({ ...formData, weight: value });
                    }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                  <p className="text-sm text-gray-500">
                    Remaining weight available: {100 - totalExistingWeight}%
                  </p>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingMilestone(null);
                  }}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors"
                >
                  {editingMilestone ? 'Save Changes' : 'Add Milestone'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      <div className="space-y-4">
        <Reorder.Group 
          axis="y" 
          values={orderedMilestones} 
          onReorder={handleReorder} 
          className="space-y-4"
        >
          {orderedMilestones.map((milestone) => (
            <Reorder.Item 
              key={milestone.id} 
              value={milestone}
              className="bg-white rounded-xl p-6 shadow-sm"
              whileDrag={{ 
                scale: 1.02, 
                boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
                cursor: "grabbing",
                zIndex: 10
              }}
              transition={{ 
                type: "spring", 
                damping: 25, 
                stiffness: 300
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  {canUpdateMilestones() && (
                    <div className="cursor-grab p-1 mr-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100">
                      <GripVertical className="w-5 h-5" />
                    </div>
                  )}
                  <Flag className="w-5 h-5 text-primary-600" />
                  <h3 className="text-lg font-medium text-gray-900">{milestone.title}</h3>
                </div>
                <div className="flex items-center space-x-2">
                  {/* Only show status change dropdown for staff and contractors */}
                  {canUpdateMilestones() ? (
                    <div className="relative">
                      <button
                        onClick={() => setShowStatusMenu(showStatusMenu === milestone.id ? null : milestone.id)}
                        className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-sm ${getMilestoneStatusColor(milestone.status)}`}
                      >
                        <span className="capitalize">{milestone.status}</span>
                        <ChevronDown className="w-4 h-4" />
                      </button>

                      <AnimatePresence>
                        {showStatusMenu === milestone.id && (
                          <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="absolute right-0 mt-2 w-40 bg-white rounded-md shadow-lg z-20 border border-gray-200"
                          >
                            {statusOptions.map(option => (
                              <button
                                key={option.value}
                                onClick={() => handleStatusChange(milestone, option.value)}
                                className={`w-full text-left px-4 py-2 text-sm ${option.color} hover:opacity-80 transition-opacity ${
                                  milestone.status === option.value ? 'font-medium' : ''
                                }`}
                              >
                                {option.label}
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ) : (
                    <div className={`px-3 py-1.5 rounded-md text-sm ${getMilestoneStatusColor(milestone.status)}`}>
                      <span className="capitalize">{milestone.status}</span>
                    </div>
                  )}
                  
                  {/* Only show edit button for staff and contractors */}
                  {canUpdateMilestones() && (
                    <button
                      onClick={() => startEdit(milestone)}
                      className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                  
                  {/* Only show delete button for staff and contractors */}
                  {canUpdateMilestones() && (
                    <button
                      onClick={() => onDeleteMilestone(milestone.id)}
                      className="p-1 text-gray-400 hover:text-red-600 rounded-full hover:bg-gray-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <p className="text-gray-600 mb-4">{milestone.description}</p>

              <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <div className="flex items-center space-x-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-600">
                    Due: {new Date(milestone.dueDate).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-gray-600">Weight:</span>
                  <span className="px-2 py-1 text-sm bg-primary-50 text-primary-600 rounded-md">
                    {milestone.weight}%
                  </span>
                </div>
              </div>
            </Reorder.Item>
          ))}
        </Reorder.Group>
      </div>
    </div>
  );
}