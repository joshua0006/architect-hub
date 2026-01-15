import { FileText, ListTodo, Users, LogOut, Settings as SettingsIcon, Shield } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useOrganization } from '../contexts/OrganizationContext';
import { useAuth } from '../contexts/AuthContext';
import { useState, useRef, useEffect } from 'react';
import { NotificationIcon } from './NotificationIcon';
import { Project } from '../types';

interface HeaderProps {
  selectedProject?: Project;
}

export default function Header({ selectedProject }: HeaderProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { settings } = useOrganization();
  const { user, signOut } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isActive = (path: string) => {
    // For project overview, check if we're on the /:projectId/overview route
    if (path === '/' && selectedProject) {
      return location.pathname === `/${selectedProject.id}/overview` || location.pathname === '/';
    }
    return location.pathname === path;
  };

  const handleProjectClick = () => {
    if (selectedProject) {
      const projectOverviewPath = `/${selectedProject.id}/overview`;
      if (location.pathname === projectOverviewPath) {
        navigate(projectOverviewPath, { replace: true, state: { resetFolder: true } });
      } else {
        navigate(projectOverviewPath);
      }
    } else {
      // If no project selected, navigate to home
      navigate('/');
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/signin');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navItems = [
    { path: '/documents', icon: FileText, label: 'Documents' },
    { path: '/', icon: Users, label: 'Project', onClick: handleProjectClick },
    { path: '/team', icon: Users, label: 'Team' },
    { path: '/tasks', icon: ListTodo, label: 'Tasks' },
  ];
  
  // Check if user is an Admin
  const isAdmin = user?.role === 'Admin';
  
  return (
    <header className="fixed top-0 left-0 right-0 h-16 glass-effect z-50">
      <div className="h-full  mx-auto px-4 flex items-center justify-between">
        <div className="flex items-center space-x-2 justify-center">
          <img src="/assets/images/logo.jpg" alt="Chris Cole Architect" className="h-10" />
        </div>
        
        <div className="flex items-center space-x-8">
          <nav className="flex items-center space-x-8">
            {navItems.map((item, index) => {
              const Icon = item.icon;
              const isActiveRoute = isActive(item.path);
              
              return (
                <div key={item.path}>
                  {item.onClick ? (
                    <button
                      onClick={item.onClick}
                      className={`flex items-center space-x-2 px-3 py-2 rounded-md hover:bg-primary-50 ${
                        isActiveRoute
                          ? 'bg-primary-50 text-primary-600'
                          : item.path === '/documents'
                            ? 'text-gray-600 hover:text-primary-600 border-b-2 border-primary-200'
                            : 'text-gray-600 hover:text-primary-600'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span>{item.label}</span>
                    </button>
                  ) : (
                    <Link
                      to={item.path}
                      className={`flex items-center space-x-2 px-3 py-2 rounded-md hover:bg-primary-50 ${
                        isActiveRoute
                          ? 'bg-primary-50 text-primary-600'
                          : item.path === '/documents'
                            ? 'text-gray-600 hover:text-primary-600 border-b-2 border-primary-200'
                            : 'text-gray-600 hover:text-primary-600'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span>{item.label}</span>
                    </Link>
                  )}
                </div>
              );
            })}

            {/* Admin Link */}
            {isAdmin && (
              <Link
                to="/admin"
                className={`flex items-center space-x-2 px-3 py-2 rounded-md hover:bg-primary-50 ${
                  location.pathname.startsWith('/admin') ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:text-primary-600'
                }`}
              >
                <Shield className="w-5 h-5" />
                <span>Admin</span>
              </Link>
            )}
          </nav>

          {/* Notification Icon */}
          <NotificationIcon />

          {/* User Menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center space-x-2 px-3 py-2 rounded-md hover:bg-primary-50 text-gray-600 hover:text-primary-600"
            >
              {user?.profile?.photoURL ? (
                <img
                  src={user.profile.photoURL}
                  alt={user.displayName}
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                  <span className="text-sm font-medium text-primary-600">
                    {user?.displayName?.[0].toUpperCase()}
                  </span>
                </div>
              )}
              <span className="text-sm font-medium">{user?.displayName}</span>
            </button>

            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg py-1 border border-gray-200">
                <Link
                  to="/account"
                  onClick={() => setShowUserMenu(false)}
                  className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  <SettingsIcon className="w-4 h-4" />
                  <span>Account Settings</span>
                </Link>
                {isAdmin && (
                  <Link
                    to="/admin"
                    onClick={() => setShowUserMenu(false)}
                    className="flex items-center space-x-2 px-4 py-2 text-sm text-purple-600 hover:bg-purple-50"
                  >
                    <Shield className="w-4 h-4" />
                    <span>Admin Dashboard</span>
                  </Link>
                )}
                <button
                  onClick={handleSignOut}
                  className="flex items-center space-x-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 w-full"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}