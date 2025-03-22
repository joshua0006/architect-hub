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
  setDoc,
  serverTimestamp,
  increment,
  writeBatch,
  arrayUnion,
  arrayRemove,
  CollectionReference,
  DocumentData,
  runTransaction
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { db, storage } from "../lib/firebase";
import { Document, Project } from "../types";

const COLLECTION = "projects";

export const projectService = {
  async getAll(): Promise<Project[]> {
    const snapshot = await getDocs(collection(db, COLLECTION));
    
    // Process the data to ensure consistent structure
    return snapshot.docs.map((doc) => {
      const data = doc.data();
      
      // Ensure metadata is properly structured
      const metadata = data.metadata || {};
      
      // Handle location specifically
      const location = metadata.location || { city: '', state: '', country: '' };
      // Convert string location (if any) to object format
      const structuredLocation = typeof location === 'string' 
        ? { 
            city: location.split(',')[0]?.trim() || '',
            state: location.split(',')[1]?.trim() || '',
            country: location.split(',')[2]?.trim() || ''
          }
        : location;
      
      // Create a properly structured project object
      return {
        id: doc.id,
        name: data.name || '',
        client: data.client || '',
        status: data.status || 'active',
        progress: data.progress || 0,
        startDate: data.startDate || '',
        endDate: data.endDate || '',
        teamMemberIds: data.teamMemberIds || [],
        metadata: {
          industry: metadata.industry || '',
          projectType: metadata.projectType || '',
          location: structuredLocation,
          budget: metadata.budget || '',
          scope: metadata.scope || '',
          ...(metadata.archivedAt && { archivedAt: metadata.archivedAt }),
          ...(metadata.lastMilestoneUpdate && { lastMilestoneUpdate: metadata.lastMilestoneUpdate })
        }
      } as Project;
    });
  },

  async getByUserId(userId: string): Promise<Project[]> {
    const q = query(
      collection(db, COLLECTION),
      where("teamMemberIds", "array-contains", userId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() } as Project)
    );
  },

  async getById(id: string): Promise<Project | null> {
    const docRef = doc(db, COLLECTION, id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return null;
    }
    
    const data = docSnap.data();
    
    // Ensure metadata is properly structured
    const metadata = data.metadata || {};
    
    // Handle location specifically
    const location = metadata.location || { city: '', state: '', country: '' };
    // Convert string location (if any) to object format
    const structuredLocation = typeof location === 'string' 
      ? { 
          city: location.split(',')[0]?.trim() || '',
          state: location.split(',')[1]?.trim() || '',
          country: location.split(',')[2]?.trim() || ''
        }
      : location;
    
    // Create a properly structured project object
    return {
      id: docSnap.id,
      name: data.name || '',
      client: data.client || '',
      status: data.status || 'active',
      progress: data.progress || 0,
      startDate: data.startDate || '',
      endDate: data.endDate || '',
      teamMemberIds: data.teamMemberIds || [],
      metadata: {
        industry: metadata.industry || '',
        projectType: metadata.projectType || '',
        location: structuredLocation,
        budget: metadata.budget || '',
        scope: metadata.scope || '',
        ...(metadata.archivedAt && { archivedAt: metadata.archivedAt }),
        ...(metadata.lastMilestoneUpdate && { lastMilestoneUpdate: metadata.lastMilestoneUpdate })
      }
    } as Project;
  },

  async create(project: Omit<Project, "id">): Promise<Project> {
    try {
      const docRef = await addDoc(collection(db, COLLECTION), {
        ...project,
        teamMemberIds: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const documentsCollectionRef = collection(
        db,
        `folders/${docRef.id}/documents`
      );
      await setDoc(doc(documentsCollectionRef, "_metadata"), {
        createdAt: serverTimestamp(),
        totalDocuments: 0,
        lastUpdated: serverTimestamp(),
        settings: {
          maxFileSize: 50 * 1024 * 1024,
          allowedTypes: ["pdf", "dwg"],
          versionControl: true,
        },
      });

      return { id: docRef.id, ...project };
    } catch (error) {
      console.error("Error creating project:", error);
      throw new Error(
        "Failed to create project and initialize documents collection"
      );
    }
  },

  async update(id: string, updates: Partial<Project>): Promise<void> {
    try {
      const docRef = doc(db, COLLECTION, id);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        throw new Error("Project not found");
      }

      const currentProject = docSnap.data();

      // Create a clean update object
      const cleanUpdates: Record<string, any> = {
        updatedAt: serverTimestamp(),
      };

      // Handle status update
      if (updates.status !== undefined) {
        cleanUpdates.status = updates.status;
      }

      // Handle metadata updates
      if (updates.metadata) {
        // Get current metadata or initialize empty object
        const currentMetadata = currentProject.metadata || {};

        // Create new metadata object with only defined values
        const newMetadata = Object.entries(updates.metadata).reduce(
          (acc, [key, value]) => {
            if (value !== undefined) {
              acc[key] = value;
            }
            return acc;
          },
          {} as Record<string, any>
        );

        // Merge current and new metadata
        cleanUpdates.metadata = {
          ...currentMetadata,
          ...newMetadata,
        };
      }

      // Add other defined fields from updates
      Object.entries(updates).forEach(([key, value]) => {
        if (key !== "metadata" && value !== undefined) {
          cleanUpdates[key] = value;
        }
      });

      await updateDoc(docRef, cleanUpdates);
    } catch (error) {
      console.error("Error updating project:", error);
      throw error;
    }
  },

  async delete(id: string): Promise<void> {
    try {
      await runTransaction(db, async (transaction) => {
        const projectRef = doc(db, COLLECTION, id);
        const projectDoc = await transaction.get(projectRef);

        if (!projectDoc.exists()) {
          throw new Error("Project not found");
        }

        const project = projectDoc.data() as Project;

        // If project is archived, first update its status to active
        // This happens within the same transaction
        if (project.status === "archived") {
          transaction.update(projectRef, {
            status: "active",
            updatedAt: serverTimestamp(),
            metadata: {
              ...project.metadata,
              archivedAt: null
            }
          });
        }

        // Get all folders for this project
        const foldersRef = collection(db, "folders");
        const foldersQuery = query(foldersRef, where("projectId", "==", id));
        const foldersSnapshot = await getDocs(foldersQuery);

        // Delete all documents and their files
        for (const folderDoc of foldersSnapshot.docs) {
          const documentsRef = collection(folderDoc.ref, "documents");
          const documentsSnapshot = await getDocs(documentsRef);

          for (const docSnapshot of documentsSnapshot.docs) {
            if (docSnapshot.id !== "_metadata") {
              const documentData = docSnapshot.data() as Document & {
                storagePath?: string;
              };
              if (documentData.storagePath) {
                try {
                  const fileRef = ref(storage, documentData.storagePath);
                  await deleteObject(fileRef);
                } catch (error) {
                  console.warn("File not found in storage:", error);
                }
              }
              transaction.delete(docSnapshot.ref);
            }
          }

          transaction.delete(folderDoc.ref);
        }

        // Delete all tasks
        const tasksRef = collection(db, "tasks");
        const tasksQuery = query(tasksRef, where("projectId", "==", id));
        const tasksSnapshot = await getDocs(tasksQuery);
        tasksSnapshot.docs.forEach((doc) => {
          transaction.delete(doc.ref);
        });

        // Delete all milestones
        const milestonesRef = collection(db, "milestones");
        const milestonesQuery = query(milestonesRef, where("projectId", "==", id));
        const milestonesSnapshot = await getDocs(milestonesQuery);
        milestonesSnapshot.docs.forEach((doc) => {
          transaction.delete(doc.ref);
        });

        // Remove project references from team members
        if (project.teamMemberIds?.length) {
          const usersRef = collection(db, "users");
          for (const userId of project.teamMemberIds) {
            const userRef = doc(usersRef, userId);
            transaction.update(userRef, {
              projectIds: arrayRemove(id),
              updatedAt: serverTimestamp()
            });
          }
        }

        // Finally, delete the project document
        transaction.delete(projectRef);
      });

      console.log("Project and all associated data deleted successfully");
    } catch (error) {
      console.error("Error deleting project:", error);
      throw new Error("Failed to delete project and associated data");
    }
  },

  async addUsersToProject(projectId: string, userIds: string[]): Promise<void> {
    try {
      const batch = writeBatch(db);
      const projectRef = doc(db, COLLECTION, projectId);

      // Update project document to add user IDs
      batch.update(projectRef, {
        teamMemberIds: arrayUnion(...userIds),
        updatedAt: serverTimestamp(),
      });

      // Update each user document to add project ID
      userIds.forEach((userId) => {
        const userRef = doc(db, "users", userId);
        batch.update(userRef, {
          projectIds: arrayUnion(projectId),
          updatedAt: serverTimestamp(),
        });
      });

      await batch.commit();
    } catch (error) {
      console.error("Error adding users to project:", error);
      throw new Error("Failed to add users to project");
    }
  },

  async removeUsersFromProject(
    projectId: string,
    userIds: string[]
  ): Promise<void> {
    try {
      const batch = writeBatch(db);
      const projectRef = doc(db, COLLECTION, projectId);

      // Update project document to remove user IDs
      batch.update(projectRef, {
        teamMemberIds: arrayRemove(...userIds),
        updatedAt: serverTimestamp(),
      });

      // Update each user document to remove project ID
      userIds.forEach((userId) => {
        const userRef = doc(db, "users", userId);
        batch.update(userRef, {
          projectIds: arrayRemove(projectId),
          updatedAt: serverTimestamp(),
        });
      });

      await batch.commit();
    } catch (error) {
      console.error("Error removing users from project:", error);
      throw new Error("Failed to remove users from project");
    }
  },

  documents: {
    async getAll(projectId: string): Promise<Document[]> {
      try {
        console.log("Fetching documents for project:", projectId);
        const docsRef = collection(db, `folders/${projectId}/documents`);
        const snapshot = await getDocs(docsRef);

        const documents = snapshot.docs
          .filter((doc) => doc.id !== "_metadata")
          .map((doc) => {
            const data = doc.data();
            console.log("Raw document data:", data);

            return {
              id: doc.id,
              projectId,
              name: data.name || "",
              type: data.type || "pdf",
              folderId: data.metadata?.folderId || data.folderId || "",
              version: data.metadata?.version || data.version || 1,
              dateModified:
                data.dateModified ||
                data.updatedAt?.toDate?.()?.toISOString() ||
                new Date().toISOString(),
              url: data.url || "",
            };
          });

        return documents;
      } catch (error) {
        console.error("Error getting documents:", error);
        throw new Error("Failed to get documents");
      }
    },

    async create(
      projectId: string,
      document: Omit<Document, "id" | "url">,
      file: File
    ): Promise<Document> {
      if (!projectId) {
        throw new Error("Project ID is required");
      }

      try {
        console.log("Creating document:", { projectId, document, file });

        // Get folder information if a folderId is provided
        let folderPath = "";
        let folderMetadata = null;

        if (document.folderId) {
          const folderRef = doc(db, "folders", document.folderId);
          const folderSnap = await getDoc(folderRef);

          if (folderSnap.exists()) {
            const folderData = folderSnap.data();
            folderPath = folderData.metadata?.path || "";
            folderMetadata = {
              folderId: document.folderId,
              folderPath: folderData.metadata?.path,
              folderName: folderData.name,
              folderLevel: folderData.metadata?.level || 0,
            };
          }
        }

        // Generate unique filename
        const timestamp = Date.now();
        const uniqueFilename = `${timestamp}-${file.name.replace(
          /[^a-zA-Z0-9.-]/g,
          "_"
        )}`;

        // Create storage path including folder structure
        const storagePath = `folders/${folderPath}/${uniqueFilename}`;

        // Upload file to Storage with metadata
        const storageRef = ref(storage, storagePath);
        const metadata = {
          contentType: file.type,
          customMetadata: {
            originalFilename: file.name,
            projectId,
            folderId: document.folderId || "",
            folderPath: folderPath || "",
            version: "1",
          },
        };

        console.log("Uploading file to storage:", { storagePath, metadata });
        const uploadResult = await uploadBytes(storageRef, file, metadata);
        const url = await getDownloadURL(uploadResult.ref);
        console.log("File uploaded successfully:", { url });

        // Create document data
        const documentData: DocumentData = {
          name: document.name,
          type: "pdf",
          url,
          storagePath,
          dateModified: new Date().toISOString(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          folderId: document.folderId || "",
          version: 1,
          metadata: {
            projectId,
            folderId: document.folderId || null,
            folderInfo: folderMetadata,
            originalFilename: file.name,
            contentType: file.type,
            size: file.size,
            path: storagePath,
            version: 1,
          },
        };

        // Create document in Firestore
        console.log("Creating Firestore document:", documentData);
        const docsRef = collection(db, `${COLLECTION}/${projectId}/documents`);
        const docRef = await addDoc(docsRef, documentData);

        // Create initial version record
        const versionsRef = collection(docRef, "versions");
        await addDoc(versionsRef, {
          version: 1,
          url,
          storagePath,
          uploadedAt: serverTimestamp(),
          metadata: {
            originalFilename: file.name,
            contentType: file.type,
            size: file.size,
            folderId: document.folderId || null,
            folderInfo: folderMetadata,
          },
        });

        // Update metadata document
        const metadataRef = doc(
          db,
          `${COLLECTION}/${projectId}/documents/_metadata`
        );
        await updateDoc(metadataRef, {
          totalDocuments: increment(1),
          lastUpdated: serverTimestamp(),
        });

        // Return the new document
        const newDocument: Document = {
          id: docRef.id,
          projectId,
          name: document.name,
          type: "pdf",
          folderId: document.folderId || "",
          version: 1,
          dateModified: new Date().toISOString(),
          url,
        };

        console.log("Document created successfully:", newDocument);
        return newDocument;
      } catch (error) {
        console.error("Error creating document:", error);
        throw new Error("Failed to create document. Please try again.");
      }
    },

    async updateFile(
      projectId: string,
      documentId: string,
      file: File
    ): Promise<string> {
      try {
        const docRef = doc(
          db,
          `${COLLECTION}/${projectId}/documents`,
          documentId
        );
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          throw new Error("Document not found");
        }

        const document = { id: docSnap.id, ...docSnap.data() } as Document & {
          storagePath?: string;
          metadata?: {
            version: number;
            folderId: string | null;
          };
        };

        const timestamp = Date.now();
        const uniqueFilename = `${timestamp}-${file.name.replace(
          /[^a-zA-Z0-9.-]/g,
          "_"
        )}`;

        const folderPath = document.folderId ? `${document.folderId}/` : "";
        const storagePath = `projects/${projectId}/documents/${folderPath}${uniqueFilename}`;

        const storageRef = ref(storage, storagePath);
        const metadata = {
          contentType: file.type,
          customMetadata: {
            originalFilename: file.name,
            projectId,
            folderId: document.folderId || "",
            version: String((document.metadata?.version || 1) + 1),
          },
        };

        const uploadResult = await uploadBytes(storageRef, file, metadata);
        const url = await getDownloadURL(uploadResult.ref);

        const pdfCollectionRef = collection(docRef, "versions");
        await addDoc(pdfCollectionRef, {
          version: (document.metadata?.version || 1) + 1,
          url,
          storagePath,
          uploadedAt: serverTimestamp(),
          metadata: {
            originalFilename: file.name,
            contentType: file.type,
            size: file.size,
          },
        });

        await updateDoc(docRef, {
          url,
          storagePath,
          dateModified: new Date().toISOString(),
          updatedAt: serverTimestamp(),
          metadata: {
            ...document.metadata,
            version: (document.metadata?.version || 1) + 1,
            originalFilename: file.name,
            contentType: file.type,
            size: file.size,
            path: storagePath,
            lastModified: new Date().toISOString(),
          },
        });

        return url;
      } catch (error) {
        console.error("Error updating document file:", error);
        throw new Error("Failed to update document file. Please try again.");
      }
    },

    async delete(projectId: string, documentId: string): Promise<void> {
      try {
        const docRef = doc(
          db,
          `${COLLECTION}/${projectId}/documents`,
          documentId
        );
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const document = { id: docSnap.id, ...docSnap.data() } as Document & {
            storagePath?: string;
          };

          const versionsRef = collection(docRef, "versions");
          const versionsSnapshot = await getDocs(versionsRef);

          const deletePromises = versionsSnapshot.docs.map(
            async (versionDoc) => {
              const versionData = versionDoc.data();
              if (versionData.storagePath) {
                try {
                  const fileRef = ref(storage, versionData.storagePath);
                  await deleteObject(fileRef);
                } catch (error) {
                  console.warn("File not found:", error);
                }
              }
              return deleteDoc(versionDoc.ref);
            }
          );

          await Promise.all(deletePromises);

          await deleteDoc(docRef);

          const metadataRef = doc(
            db,
            `${COLLECTION}/${projectId}/documents/_metadata`
          );
          await updateDoc(metadataRef, {
            totalDocuments: increment(-1),
            lastUpdated: serverTimestamp(),
          });
        }
      } catch (error) {
        console.error("Error deleting document:", error);
        throw new Error("Failed to delete document");
      }
    },

    async getVersions(projectId: string, documentId: string): Promise<any[]> {
      try {
        const docRef = doc(
          db,
          `${COLLECTION}/${projectId}/documents`,
          documentId
        );
        const versionsRef = collection(docRef, "versions");
        const snapshot = await getDocs(versionsRef);

        return snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
      } catch (error) {
        console.error("Error getting document versions:", error);
        throw new Error("Failed to get document versions");
      }
    },
  },

  async deleteProject(projectId: string): Promise<void> {
    const project = await this.getProject(projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    // If project is archived, activate it first
    if (project.status === "archived") {
      await this.prisma.project.update({
        where: { id: projectId },
        data: { status: "active" },
      });
    }

    // Delete the project immediately
    await this.prisma.project.delete({
      where: { id: projectId },
    });
  },
};