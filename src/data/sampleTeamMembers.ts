import { TeamMember } from '../types';

export const sampleTeamMembers: TeamMember[] = [
  {
    id: '1',
    name: 'Sarah Chen',
    email: 'sarah.chen@jezweb.info',
    phone: '+1 (555) 123-4567',
    role: 'Senior Architect',
    type: 'Staff',
    projectIds: ['1', '2'],
  },
  {
    id: '2',
    name: 'Michael Torres',
    email: 'michael.torres@jezweb.info',
    phone: '+1 (555) 987-6543',
    role: 'Project Manager',
    type: 'Staff',
    projectIds: ['1', '3', '4'],
  },
  {
    id: '3',
    name: 'Emma Wilson',
    email: 'emma.wilson@jezweb.info',
    phone: '+1 (555) 456-7890',
    role: 'Client Representative',
    type: 'Client',
    projectIds: ['5'],
  },
  {
    id: '4',
    name: 'David Kumar',
    email: 'david.kumar@jezweb.info',
    phone: '+1 (555) 234-5678',
    role: 'Structural Engineer',
    type: 'Contractor',
    projectIds: ['1', '4'],
  },
  {
    id: '5',
    name: 'Lisa Patel',
    email: 'lisa.patel@jezweb.info',
    phone: '+1 (555) 345-6789',
    role: 'Interior Designer',
    type: 'Staff',
    projectIds: ['1', '2', '3'],
  },
  {
    id: '6',
    name: 'James Thompson',
    email: 'james.thompson@jezweb.info',
    phone: '+1 (555) 456-7890',
    role: 'MEP Consultant',
    type: 'Contractor',
    projectIds: ['2', '4'],
  },
  {
    id: '7',
    name: 'Sophia Rodriguez',
    email: 'sophia.rodriguez@jezweb.info',
    phone: '+1 (555) 567-8901',
    role: 'Client Director',
    type: 'Client',
    projectIds: ['2'],
  },
  {
    id: '8',
    name: 'Alex Nguyen',
    email: 'alex.nguyen@jezweb.info',
    phone: '+1 (555) 678-9012',
    role: 'Landscape Architect',
    type: 'Staff',
    projectIds: ['1', '3'],
  },
  {
    id: '9',
    name: 'Oliver Brown',
    email: 'oliver.brown@jezweb.info',
    phone: '+1 (555) 789-0123',
    role: 'Construction Manager',
    type: 'Contractor',
    projectIds: ['3', '5'],
  },
];