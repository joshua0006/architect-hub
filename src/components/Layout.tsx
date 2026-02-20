import React, { ReactNode, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Settings as SettingsIcon, Users, ChevronLeft, ChevronRight } from 'lucide-react';
import Header from './Header';
import { Project } from '../types';

interface LayoutProps {
  sidebar?: ReactNode;
  children: ReactNode;
  fullscreenMode?: boolean;
  selectedProject?: Project;
}

export default function Layout({ sidebar, children, fullscreenMode = false, selectedProject }: LayoutProps) {
  const location = useLocation();
  const [minimized, setMinimized] = useState(false);

  const toggleSidebar = () => {
    setMinimized(prev => !prev);
  };

  // Clone sidebar element with minimized prop
  const sidebarWithProps = sidebar ? 
    React.cloneElement(sidebar as React.ReactElement, { minimized }) : 
    null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header selectedProject={selectedProject} />
      
      <div className="pt-20 flex">
        {sidebar && !fullscreenMode && (
          <aside
            className={`relative ${minimized ? 'w-16' : 'w-1/4 min-w-[280px] max-w-sm'} h-[calc(100vh-4rem)] bg-white border-r border-gray-200 transition-all duration-300`}
          >
            {/* Toggle button */}
            <button 
              onClick={toggleSidebar}
              className="absolute right-0 top-4 transform translate-x-1/2 bg-white border border-gray-200 rounded-full p-1 z-50 shadow-sm hover:bg-gray-50"
            >
              {minimized ? 
                <ChevronRight className="w-4 h-4 text-gray-600" /> : 
                <ChevronLeft className="w-4 h-4 text-gray-600" />
              }
            </button>

            {/* Project list container with padding bottom for tabs */}
            <div className="h-full overflow-y-auto pb-16">
              {sidebarWithProps}
            </div>

            {/* Fixed bottom tabs */}
            <div className="absolute bottom-0 left-0 w-full bg-white border-t border-gray-200">
              <div className={`flex items-center ${minimized ? 'p-2 flex-col space-y-4' : 'p-4 space-x-2'}`}>
                <Link
                  to="/people"
                  className={`flex items-center ${minimized ? 'justify-center' : 'space-x-2 flex-1 justify-center'} px-3 py-2 rounded-md hover:bg-primary-50 ${
                    location.pathname === '/people' ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:text-primary-600'
                  }`}
                >
                  <Users className="w-5 h-5" />
                  {!minimized && <span>People</span>}
                </Link>
                <Link
                  to="/settings"
                  className={`flex items-center ${minimized ? 'justify-center' : 'space-x-2 flex-1 justify-center'} px-3 py-2 rounded-md hover:bg-primary-50 ${
                    location.pathname === '/settings' ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:text-primary-600'
                  }`}
                >
                  <SettingsIcon className="w-5 h-5" />
                  {!minimized && <span>Settings</span>}
                </Link>
              </div>
            </div>
          </aside>
        )}
        
        <main
          className={`flex-1 h-[calc(100vh-4rem)] overflow-y-auto ${fullscreenMode || !sidebar ? 'w-full' : ''}`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}