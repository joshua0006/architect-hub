import { Folder } from '../types';

export const sampleFolders: Folder[] = [
  // Project 1: Denarau Beach Resort & Spa
  // Admin
  { id: '1-admin', projectId: '1', name: 'Admin', parentId: undefined },
  { id: '1-contracts', projectId: '1', name: 'Contracts', parentId: '1-admin' },
  { id: '1-correspondence', projectId: '1', name: 'Correspondence', parentId: '1-admin' },
  { id: '1-meetings', projectId: '1', name: 'Meetings', parentId: '1-admin' },
  { id: '1-financials', projectId: '1', name: 'Financials', parentId: '1-admin' },
  // Design
  { id: '1-design', projectId: '1', name: 'Design', parentId: undefined },
  { id: '1-concept', projectId: '1', name: 'Concept', parentId: '1-design' },
  { id: '1-schematics', projectId: '1', name: 'Schematics', parentId: '1-design' },
  { id: '1-drawings', projectId: '1', name: 'Drawings', parentId: '1-design' },
  { id: '1-materials', projectId: '1', name: 'Materials', parentId: '1-design' },
  // Construction
  { id: '1-construction', projectId: '1', name: 'Construction', parentId: undefined },
  { id: '1-documents', projectId: '1', name: 'Documents', parentId: '1-construction' },
  { id: '1-submittals', projectId: '1', name: 'Submittals', parentId: '1-construction' },
  { id: '1-site-photos', projectId: '1', name: 'Site Photos', parentId: '1-construction' },
  { id: '1-change-orders', projectId: '1', name: 'Change Orders', parentId: '1-construction' },
  // Closeout
  { id: '1-closeout', projectId: '1', name: 'Closeout', parentId: undefined },
  { id: '1-warranties', projectId: '1', name: 'Warranties', parentId: '1-closeout' },
  { id: '1-manuals', projectId: '1', name: 'Manuals', parentId: '1-closeout' },
  { id: '1-inspections', projectId: '1', name: 'Inspections', parentId: '1-closeout' },

  // Project 2: Vaucluse Harbour View Residence
  // Admin
  { id: '2-admin', projectId: '2', name: 'Admin', parentId: undefined },
  { id: '2-contracts', projectId: '2', name: 'Contracts', parentId: '2-admin' },
  { id: '2-correspondence', projectId: '2', name: 'Correspondence', parentId: '2-admin' },
  { id: '2-meetings', projectId: '2', name: 'Meetings', parentId: '2-admin' },
  { id: '2-financials', projectId: '2', name: 'Financials', parentId: '2-admin' },
  // Design
  { id: '2-design', projectId: '2', name: 'Design', parentId: undefined },
  { id: '2-concept', projectId: '2', name: 'Concept', parentId: '2-design' },
  { id: '2-schematics', projectId: '2', name: 'Schematics', parentId: '2-design' },
  { id: '2-drawings', projectId: '2', name: 'Drawings', parentId: '2-design' },
  { id: '2-materials', projectId: '2', name: 'Materials', parentId: '2-design' },
  // Construction
  { id: '2-construction', projectId: '2', name: 'Construction', parentId: undefined },
  { id: '2-documents', projectId: '2', name: 'Documents', parentId: '2-construction' },
  { id: '2-submittals', projectId: '2', name: 'Submittals', parentId: '2-construction' },
  { id: '2-site-photos', projectId: '2', name: 'Site Photos', parentId: '2-construction' },
  { id: '2-change-orders', projectId: '2', name: 'Change Orders', parentId: '2-construction' },
  // Closeout
  { id: '2-closeout', projectId: '2', name: 'Closeout', parentId: undefined },
  { id: '2-warranties', projectId: '2', name: 'Warranties', parentId: '2-closeout' },
  { id: '2-manuals', projectId: '2', name: 'Manuals', parentId: '2-closeout' },
  { id: '2-inspections', projectId: '2', name: 'Inspections', parentId: '2-closeout' },

  // Project 3: Port Vila Beachfront Villa
  // Admin
  { id: '3-admin', projectId: '3', name: 'Admin', parentId: undefined },
  { id: '3-contracts', projectId: '3', name: 'Contracts', parentId: '3-admin' },
  { id: '3-correspondence', projectId: '3', name: 'Correspondence', parentId: '3-admin' },
  { id: '3-meetings', projectId: '3', name: 'Meetings', parentId: '3-admin' },
  { id: '3-financials', projectId: '3', name: 'Financials', parentId: '3-admin' },
  // Design
  { id: '3-design', projectId: '3', name: 'Design', parentId: undefined },
  { id: '3-concept', projectId: '3', name: 'Concept', parentId: '3-design' },
  { id: '3-schematics', projectId: '3', name: 'Schematics', parentId: '3-design' },
  { id: '3-drawings', projectId: '3', name: 'Drawings', parentId: '3-design' },
  { id: '3-materials', projectId: '3', name: 'Materials', parentId: '3-design' },
  // Construction
  { id: '3-construction', projectId: '3', name: 'Construction', parentId: undefined },
  { id: '3-documents', projectId: '3', name: 'Documents', parentId: '3-construction' },
  { id: '3-submittals', projectId: '3', name: 'Submittals', parentId: '3-construction' },
  { id: '3-site-photos', projectId: '3', name: 'Site Photos', parentId: '3-construction' },
  { id: '3-change-orders', projectId: '3', name: 'Change Orders', parentId: '3-construction' },
  // Closeout
  { id: '3-closeout', projectId: '3', name: 'Closeout', parentId: undefined },
  { id: '3-warranties', projectId: '3', name: 'Warranties', parentId: '3-closeout' },
  { id: '3-manuals', projectId: '3', name: 'Manuals', parentId: '3-closeout' },
  { id: '3-inspections', projectId: '3', name: 'Inspections', parentId: '3-closeout' },

  // Project 4: Suva Commercial Tower
  // Admin
  { id: '4-admin', projectId: '4', name: 'Admin', parentId: undefined },
  { id: '4-contracts', projectId: '4', name: 'Contracts', parentId: '4-admin' },
  { id: '4-correspondence', projectId: '4', name: 'Correspondence', parentId: '4-admin' },
  { id: '4-meetings', projectId: '4', name: 'Meetings', parentId: '4-admin' },
  { id: '4-financials', projectId: '4', name: 'Financials', parentId: '4-admin' },
  // Design
  { id: '4-design', projectId: '4', name: 'Design', parentId: undefined },
  { id: '4-concept', projectId: '4', name: 'Concept', parentId: '4-design' },
  { id: '4-schematics', projectId: '4', name: 'Schematics', parentId: '4-design' },
  { id: '4-drawings', projectId: '4', name: 'Drawings', parentId: '4-design' },
  { id: '4-materials', projectId: '4', name: 'Materials', parentId: '4-design' },
  // Construction
  { id: '4-construction', projectId: '4', name: 'Construction', parentId: undefined },
  { id: '4-documents', projectId: '4', name: 'Documents', parentId: '4-construction' },
  { id: '4-submittals', projectId: '4', name: 'Submittals', parentId: '4-construction' },
  { id: '4-site-photos', projectId: '4', name: 'Site Photos', parentId: '4-construction' },
  { id: '4-change-orders', projectId: '4', name: 'Change Orders', parentId: '4-construction' },
  // Closeout
  { id: '4-closeout', projectId: '4', name: 'Closeout', parentId: undefined },
  { id: '4-warranties', projectId: '4', name: 'Warranties', parentId: '4-closeout' },
  { id: '4-manuals', projectId: '4', name: 'Manuals', parentId: '4-closeout' },
  { id: '4-inspections', projectId: '4', name: 'Inspections', parentId: '4-closeout' },

  // Project 5: Ministry of Infrastructure Complex
  // Admin
  { id: '5-admin', projectId: '5', name: 'Admin', parentId: undefined },
  { id: '5-contracts', projectId: '5', name: 'Contracts', parentId: '5-admin' },
  { id: '5-correspondence', projectId: '5', name: 'Correspondence', parentId: '5-admin' },
  { id: '5-meetings', projectId: '5', name: 'Meetings', parentId: '5-admin' },
  { id: '5-financials', projectId: '5', name: 'Financials', parentId: '5-admin' },
  // Design
  { id: '5-design', projectId: '5', name: 'Design', parentId: undefined },
  { id: '5-concept', projectId: '5', name: 'Concept', parentId: '5-design' },
  { id: '5-schematics', projectId: '5', name: 'Schematics', parentId: '5-design' },
  { id: '5-drawings', projectId: '5', name: 'Drawings', parentId: '5-design' },
  { id: '5-materials', projectId: '5', name: 'Materials', parentId: '5-design' },
  // Construction
  { id: '5-construction', projectId: '5', name: 'Construction', parentId: undefined },
  { id: '5-documents', projectId: '5', name: 'Documents', parentId: '5-construction' },
  { id: '5-submittals', projectId: '5', name: 'Submittals', parentId: '5-construction' },
  { id: '5-site-photos', projectId: '5', name: 'Site Photos', parentId: '5-construction' },
  { id: '5-change-orders', projectId: '5', name: 'Change Orders', parentId: '5-construction' },
  // Closeout
  { id: '5-closeout', projectId: '5', name: 'Closeout', parentId: undefined },
  { id: '5-warranties', projectId: '5', name: 'Warranties', parentId: '5-closeout' },
  { id: '5-manuals', projectId: '5', name: 'Manuals', parentId: '5-closeout' },
  { id: '5-inspections', projectId: '5', name: 'Inspections', parentId: '5-closeout' },
];