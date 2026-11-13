import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileNav } from './MobileNav';
import { APP_NAME } from '../../config/brand';

export const AppLayout: React.FC = () => {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  useEffect(() => {
    document.title = APP_NAME;
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-studio-bg text-studio-text">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex flex-shrink-0">
        <Sidebar />
      </div>

      {/* Mobile Navigation Drawer */}
      <MobileNav isOpen={isMobileNavOpen} onClose={() => setIsMobileNavOpen(false)} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header onOpenMobileNav={() => setIsMobileNavOpen(true)} />
        <main className="flex-1 overflow-y-auto bg-studio-bg">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
