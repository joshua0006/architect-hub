// N8n Function node for creating a Firebase project document
// Include all fields shown in the Firebase projects collection

// Input parameters to be provided to the node
const input = $input.all();

// Required fields validation


// Create timestamps
const now = new Date();
const timestamp = {
  seconds: Math.floor(now.getTime() / 1000),
  nanoseconds: now.getMilliseconds() * 1000000
};

// Format date as YYYY-MM-DD
const formatDate = (date) => {
  const d = new Date(date);
  return d.toISOString().split('T')[0];
};

// Build complete project document
const projectData = {
  // Main fields
  name: $input.first().json.name || "Untitled Project",
  client: input.client || "",
  createdAt: $input.first().json.createdTime || timestamp,
  updatedAt: $input.first().json.modifiedTime || timestamp,
  startDate: $input.first().json.createdTime || formatDate(now),
  endDate: input.endDate || "",
  status: input.status || "active",
  progress: input.progress || 0,
  
  // Metadata object
  metadata: {
    budget: input.budget || "",
    industry: input.industry || "",
    location: input.location || "",
    projectType: input.projectType || "",
    scope: input.scope || "",
    lastMilestoneUpdate: $input.first().json.modifiedTime || timestamp
  },
  
  // Team members
  teamMemberIds: input.teamMemberIds || []
};

// Generate unique ID if not provided
if (!input.id) {
  projectData.id = $input.first().json.id || ""
}

// Return formatted data ready for Firebase
return {
  json: projectData
}; 