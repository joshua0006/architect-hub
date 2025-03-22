import { Task } from '../types';

export const sampleTasks: Task[] = [
  // Denarau Beach Resort & Spa (Project 1)
  // Admin Tasks
  {
    id: '1-admin-1',
    projectId: '1',
    title: 'Set up project filing system',
    description: 'Establish and organize both physical and digital filing systems for project documentation',
    assignedTo: '2', // Michael Torres (Project Manager)
    dueDate: '2024-03-15',
    priority: 'high',
    status: 'in-progress',
    category: 'Admin',
  },
  {
    id: '1-admin-2',
    projectId: '1',
    title: 'Draft and finalize client contracts',
    description: 'Prepare and review all contract documents with Paradise Resorts Ltd',
    assignedTo: '2', // Michael Torres
    dueDate: '2024-03-20',
    priority: 'high',
    status: 'todo',
    category: 'Admin',
  },
  {
    id: '1-admin-3',
    projectId: '1',
    title: 'Schedule kick-off meeting',
    description: 'Organize initial project kick-off meeting with all stakeholders and prepare agenda',
    assignedTo: '2', // Michael Torres
    dueDate: '2024-03-25',
    priority: 'medium',
    status: 'todo',
    category: 'Admin',
  },

  // Design Tasks
  {
    id: '1-design-1',
    projectId: '1',
    title: 'Conduct site analysis',
    description: 'Complete comprehensive site analysis including environmental conditions and existing structures',
    assignedTo: '1', // Sarah Chen (Senior Architect)
    dueDate: '2024-04-01',
    priority: 'high',
    status: 'todo',
    category: 'Design',
  },
  {
    id: '1-design-2',
    projectId: '1',
    title: 'Develop schematic designs',
    description: 'Create initial design concepts for resort layout and key facilities',
    assignedTo: '1', // Sarah Chen
    dueDate: '2024-04-15',
    priority: 'high',
    status: 'todo',
    category: 'Design',
  },
  {
    id: '1-design-3',
    projectId: '1',
    title: 'Interior design development',
    description: 'Specify materials, finishes, and fixtures for all interior spaces',
    assignedTo: '5', // Lisa Patel (Interior Designer)
    dueDate: '2024-04-30',
    priority: 'medium',
    status: 'todo',
    category: 'Design',
  },

  // Construction Tasks
  {
    id: '1-construction-1',
    projectId: '1',
    title: 'Review shop drawings',
    description: 'Review and approve contractor shop drawings and submittals',
    assignedTo: '4', // David Kumar (Structural Engineer)
    dueDate: '2024-05-15',
    priority: 'high',
    status: 'todo',
    category: 'Construction',
  },
  {
    id: '1-construction-2',
    projectId: '1',
    title: 'Conduct site inspections',
    description: 'Regular site visits to monitor construction progress and quality',
    assignedTo: '9', // Oliver Brown (Construction Manager)
    dueDate: '2024-05-30',
    priority: 'medium',
    status: 'todo',
    category: 'Construction',
  },

  // Vaucluse Harbour View Residence (Project 2)
  // Admin Tasks
  {
    id: '2-admin-1',
    projectId: '2',
    title: 'Process initial invoices',
    description: 'Process and track all project-related expenses and invoices',
    assignedTo: '2', // Michael Torres
    dueDate: '2024-03-20',
    priority: 'medium',
    status: 'todo',
    category: 'Admin',
  },
  {
    id: '2-admin-2',
    projectId: '2',
    title: 'Maintain insurance certificates',
    description: 'Ensure all required insurance certificates are current and properly filed',
    assignedTo: '2', // Michael Torres
    dueDate: '2024-03-25',
    priority: 'medium',
    status: 'todo',
    category: 'Admin',
  },

  // Design Tasks
  {
    id: '2-design-1',
    projectId: '2',
    title: 'Create detailed floor plans',
    description: 'Develop comprehensive floor plans, elevations, and sections',
    assignedTo: '1', // Sarah Chen
    dueDate: '2024-04-10',
    priority: 'high',
    status: 'todo',
    category: 'Design',
  },
  {
    id: '2-design-2',
    projectId: '2',
    title: 'MEP coordination',
    description: 'Coordinate design with structural and MEP engineers',
    assignedTo: '6', // James Thompson (MEP Consultant)
    dueDate: '2024-04-20',
    priority: 'high',
    status: 'todo',
    category: 'Design',
  },

  // Port Vila Beachfront Villa (Project 3)
  // Design Tasks
  {
    id: '3-design-1',
    projectId: '3',
    title: 'Prepare 3D renderings',
    description: 'Create detailed 3D visualizations for client presentation',
    assignedTo: '5', // Lisa Patel
    dueDate: '2024-04-15',
    priority: 'medium',
    status: 'todo',
    category: 'Design',
  },

  // Construction Tasks
  {
    id: '3-construction-1',
    projectId: '3',
    title: 'Manage RFIs',
    description: 'Respond to contractor Requests for Information (RFIs)',
    assignedTo: '9', // Oliver Brown
    dueDate: '2024-05-01',
    priority: 'high',
    status: 'todo',
    category: 'Construction',
  },
  {
    id: '3-construction-2',
    projectId: '3',
    title: 'Negotiate change orders',
    description: 'Review and approve construction change orders',
    assignedTo: '9', // Oliver Brown
    dueDate: '2024-05-15',
    priority: 'medium',
    status: 'todo',
    category: 'Construction',
  },

  // Suva Commercial Tower (Project 4)
  // Closeout Tasks
  {
    id: '4-closeout-1',
    projectId: '4',
    title: 'Obtain occupancy certificate',
    description: 'Coordinate with authorities to obtain Certificate of Occupancy',
    assignedTo: '2', // Michael Torres
    dueDate: '2024-06-01',
    priority: 'high',
    status: 'todo',
    category: 'Closeout',
  },
  {
    id: '4-closeout-2',
    projectId: '4',
    title: 'Compile as-built drawings',
    description: 'Gather and organize all as-built drawings and specifications',
    assignedTo: '1', // Sarah Chen
    dueDate: '2024-06-15',
    priority: 'medium',
    status: 'todo',
    category: 'Closeout',
  },

  // Ministry of Infrastructure Complex (Project 5)
  // Other Tasks
  {
    id: '5-other-1',
    projectId: '5',
    title: 'Research building codes',
    description: 'Review and document all applicable local building codes and regulations',
    assignedTo: '1', // Sarah Chen
    dueDate: '2024-03-30',
    priority: 'high',
    status: 'todo',
    category: 'Other',
  },
  {
    id: '5-other-2',
    projectId: '5',
    title: 'Utility coordination',
    description: 'Coordinate with utility companies for service connections',
    assignedTo: '6', // James Thompson
    dueDate: '2024-04-15',
    priority: 'medium',
    status: 'todo',
    category: 'Other',
  },
  {
    id: '5-other-3',
    projectId: '5',
    title: 'Sustainable design strategy',
    description: 'Develop comprehensive sustainable design approach and documentation',
    assignedTo: '8', // Alex Nguyen
    dueDate: '2024-04-30',
    priority: 'medium',
    status: 'todo',
    category: 'Other',
  },
];