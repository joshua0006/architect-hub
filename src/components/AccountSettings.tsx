import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Save, Loader2, Check, AlertCircle } from 'lucide-react';
import { UserProfile } from '../types/auth';

// Define timezone options
const TIMEZONES = [
  { value: "UTC", label: "UTC" },
  // Pacific/Oceania
  { value: "Pacific/Fiji", label: "Fiji Time" },
  { value: "Pacific/Auckland", label: "New Zealand Time" },
  { value: "Pacific/Port_Moresby", label: "Papua New Guinea Time" },
  { value: "Pacific/Honolulu", label: "Hawaii Time" },
  // Australia
  { value: "Australia/Sydney", label: "Australian Eastern Time" },
  { value: "Australia/Darwin", label: "Australian Central Time" },
  { value: "Australia/Perth", label: "Australian Western Time" },
  // Asia
  { value: "Asia/Tokyo", label: "Japan Time" },
  { value: "Asia/Singapore", label: "Singapore Time" },
  // Americas
  { value: "America/New_York", label: "Eastern Time" },
  { value: "America/Chicago", label: "Central Time" },
  { value: "America/Denver", label: "Mountain Time" },
  { value: "America/Los_Angeles", label: "Pacific Time" },
  // Europe
  { value: "Europe/London", label: "British Time" },
  { value: "Europe/Paris", label: "Central European Time" }
];

export default function AccountSettings() {
  const { user, updateProfile, updateProfilePicture } = useAuth();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  

  
  const [formData, setFormData] = useState<UserProfile>({
    photoURL: null,
    title: '',
    phone: '',
    location: '',
    timezone: 'UTC',
    bio: '', // Added the missing 'bio' property required by UserProfile type
    notifications: {
      email: true,
      push: true
    }
  });

  // Update form data when user data is loaded
  useEffect(() => {
    if (user?.profile) {
      setFormData({
        photoURL: user.profile.photoURL || null,
        title: user.profile.title || '',
        phone: user.profile.phone || '',
        location: user.profile.location || '',
        timezone: user.profile.timezone || 'UTC',
        notifications: user.profile.notifications || {
          email: true,
          push: true
        }
      });
    }
  }, [user]);

  const handlePhotoClick = () => {
    fileInputRef.current?.click();
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image size must be less than 5MB');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await updateProfilePicture(file);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      setError('Failed to update profile picture');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      await updateProfile(formData);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      setError('Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const checkbox = e.target as HTMLInputElement;
      setFormData(prev => ({
        ...prev,
        notifications: {
          ...prev.notifications,
          [name.replace('notifications.', '')]: checkbox.checked
        }
      }));
    } else if (name.startsWith('notifications.')) {
      setFormData(prev => ({
        ...prev,
        notifications: {
          ...prev.notifications,
          [name.replace('notifications.', '')]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  if (!user) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Account Settings</h1>

      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <div className="flex items-start space-x-6">
          <div className="relative group">
            <div 
              className="w-24 h-24 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center relative cursor-pointer"
              onClick={handlePhotoClick}
            >
              {formData.photoURL ? (
                <img 
                  src={formData.photoURL} 
                  alt={user.displayName || 'Profile'} 
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-3xl font-semibold text-gray-400">
                  {user.displayName?.[0].toUpperCase()}
                </div>
              )}
              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all flex items-center justify-center">
                <Camera className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              className="hidden"
            />
          </div>

          <div className="flex-1">
            <h3 className="text-lg font-medium text-gray-900">{user.displayName}</h3>
            <p className="text-sm text-gray-500">{user.email}</p>
            <p className="mt-1 text-sm text-gray-500">
              Role: <span className="font-medium">{user.role}</span>
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Professional Title
          </label>
          <input
            type="text"
            name="title"
            value={formData.title}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="e.g., Senior Architect"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone Number
            </label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="+1 (555) 123-4567"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Location
            </label>
            <input
              type="text"
              name="location"
              value={formData.location}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="City, Country"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Time Zone
            </label>
            <select
              name="timezone"
              value={formData.timezone}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {TIMEZONES.map(tz => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="flex items-center space-x-2 text-red-600 bg-red-50 p-3 rounded-md">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        <AnimatePresence>
          {success && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center space-x-2 text-green-600 bg-green-50 p-3 rounded-md"
            >
              <Check className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm">Profile updated successfully</p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Changes</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}