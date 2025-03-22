import { Project } from '../types';

export const sampleProjects: Project[] = [
  {
    id: '1',
    name: 'Denarau Beach Resort & Spa',
    client: 'Paradise Resorts Ltd',
    status: 'active',
    progress: 25,
    startDate: '2025-01-15',
    endDate: '2026-06-30',
    metadata: {
      industry: 'Hospitality',
      projectType: 'Resort',
      location: {
        city: 'Denarau Island',
        state: 'Western Division',
        country: 'Fiji'
      },
      budget: '120M USD',
      scope: 'Full-service luxury beach resort with 250 rooms, spa facilities, and multiple restaurants'
    }
  },
  {
    id: '2',
    name: 'Vaucluse Harbour View Residence',
    client: 'Luxury Homes Australia',
    status: 'active',
    progress: 15,
    startDate: '2025-01-20',
    endDate: '2025-12-15',
    metadata: {
      industry: 'Residential',
      projectType: 'Luxury Home',
      location: {
        city: 'Sydney',
        state: 'NSW',
        country: 'Australia'
      },
      budget: '15M AUD',
      scope: 'High-end residential property with harbour views, 6 bedrooms, infinity pool'
    }
  },
  {
    id: '3',
    name: 'Port Vila Beachfront Villa',
    client: 'Island Retreats Vanuatu',
    status: 'active',
    progress: 10,
    startDate: '2025-02-01',
    endDate: '2025-12-30',
    metadata: {
      industry: 'Residential',
      projectType: 'Luxury Villa',
      location: {
        city: 'Port Vila',
        state: 'Shefa Province',
        country: 'Vanuatu'
      },
      budget: '5M USD',
      scope: 'Luxury beachfront villa with 4 bedrooms, private beach access, and staff quarters'
    }
  },
  {
    id: '4',
    name: 'Suva Commercial Tower',
    client: 'Fiji Development Corporation',
    status: 'active',
    progress: 20,
    startDate: '2025-01-10',
    endDate: '2026-12-20',
    metadata: {
      industry: 'Commercial',
      projectType: 'Office Building',
      location: {
        city: 'Suva',
        state: 'Central Division',
        country: 'Fiji'
      },
      budget: '45M FJD',
      scope: '15-story office building with retail space and underground parking'
    }
  },
  {
    id: '5',
    name: 'Ministry of Infrastructure Complex',
    client: 'Government of Fiji',
    status: 'active',
    progress: 5,
    startDate: '2025-03-01',
    endDate: '2026-09-30',
    metadata: {
      industry: 'Government',
      projectType: 'Administrative Building',
      location: {
        city: 'Suva',
        state: 'Central Division',
        country: 'Fiji'
      },
      budget: '35M FJD',
      scope: 'Government administrative complex with offices, conference facilities, and public service areas'
    }
  }
];