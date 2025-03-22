import { v4 as uuidv4 } from 'uuid';
import { addDoc, collection, getDoc, doc, deleteDoc, query, where, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface ShareToken {
  id: string;
  resourceId: string;
  type: 'file' | 'folder';
  expiresAt: Date;
  permissions: string[];
  creatorId: string;
  createdAt: Date;
}

export const createShareToken = async (
  resourceId: string,
  type: 'file' | 'folder',
  creatorId: string,
  options: {
    expiresInHours?: number;
    permissions?: string[];
  } = {}
): Promise<ShareToken> => {
  const tokenId = uuidv4();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + (options.expiresInHours || 168));

  const token: ShareToken = {
    id: tokenId,
    resourceId,
    type,
    expiresAt,
    permissions: options.permissions || ['view'],
    creatorId,
    createdAt: new Date()
  };

  // Store with the generated ID as the document ID
  await setDoc(doc(db, 'shareTokens', tokenId), token);
  return token;
};

export const validateShareToken = async (tokenId: string) => {
  try {
    // Log the exact token we're looking for
    console.log('Looking for token:', tokenId);

    // Query by ID field instead of document ID
    const tokensRef = collection(db, 'shareTokens');
    const q = query(tokensRef, where('id', '==', tokenId));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      console.error('Token not found in query');
      return null;
    }

    const tokenDoc = querySnapshot.docs[0];
    const tokenData = tokenDoc.data();

    console.log('Found token data:', tokenData);

    if (!tokenData) return null;

    // Convert timestamp
    const expiresAt = tokenData.expiresAt?.toDate?.() 
      ? tokenData.expiresAt.toDate() 
      : new Date(tokenData.expiresAt);

    return {
      ...tokenData,
      expiresAt
    } as ShareToken;

  } catch (error) {
    console.error('Token validation error:', error);
    return null;
  }
};

const checkResourceExists = async (id: string, type: 'file' | 'folder') => {
  const docRef = doc(db, `${type}s`, id);
  const docSnap = await getDoc(docRef);
  return docSnap.exists();
}; 