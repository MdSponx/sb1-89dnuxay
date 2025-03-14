import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { ChevronDown } from 'lucide-react';

interface LandingPageProps {
  onEnter?: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onEnter }) => {
  const { language, setLanguage, t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const languages = [
    { code: 'en', flag: '🇺🇸', label: 'English' },
    { code: 'th', flag: '🇹🇭', label: 'ไทย' },
    { code: 'zh', flag: '🇨🇳', label: '中文' }
  ];

  const navItems = [
    { key: 'about', label: 'About' },
    { key: 'features', label: 'Features' },
    { key: 'pricing', label: 'Pricing' }
  ];

  const currentLanguage = languages.find(lang => lang.code === language) || languages[0];

  const getTitleFontFamily = () => {
    switch (language) {
      case 'th':
        return 'Kanit';
      case 'zh':
        return 'Noto Sans SC';
      default:
        return 'Mukta Mahee';
    }
  };

  const handleGetStarted = () => {
    if (user) {
      // If user is logged in, go to dashboard
      navigate('/dashboard');
    } else {
      // If user is not logged in, go to sign up page
      navigate('/signup');
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="min-h-screen flex relative bg-[#1E4D3A]">
      {/* Top Bar with Language Switcher */}
      <div className="fixed top-0 right-0 px-[4%] py-8 z-50">
        <div ref={dropdownRef} className="relative">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center space-x-2 p-1.5 rounded-lg transition-all duration-200 hover:bg-white/10"
          >
            <span className="text-xl">{currentLanguage.flag}</span>
            <ChevronDown 
              size={18} 
              className={`text-[#F5F5F2] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {isOpen && (
            <div className="absolute top-full right-0 mt-2 w-36 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg overflow-hidden">
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => {
                    setLanguage(lang.code);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center space-x-3 px-3 py-2 text-left hover:bg-gray-100 transition-colors duration-200
                    ${language === lang.code 
                      ? 'bg-gray-50 text-[#1E4D3A]' 
                      : 'text-[#577B92]'}`}
                >
                  <span className="text-lg">{lang.flag}</span>
                  <span className="font-medium text-sm">{lang.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Vertical Navigation */}
      <nav className="fixed top-[30%] left-[10%] py-8 z-50">
        <ul className="flex flex-col space-y-8">
          {navItems.map((item, index) => (
            <li key={item.key}>
              <button 
                className="text-3xl nav-text-gradient hover:opacity-80 transition-opacity duration-200 text-left"
                style={{ 
                  fontFamily: 'Mukta Mahee', 
                  fontWeight: 200,
                  animationDelay: `${index * 0.5}s`
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Subtitle */}
      <div className="fixed top-24 right-[4%] z-40">
        <p className="text-sm text-right text-[#F5F5F2] max-w-[300px]">
          LiQid is a scriptwriting and pre-production tool, designed for seamless collaboration, efficient formatting, and professional screenplay management.
        </p>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center w-full max-w-[90%] mx-auto">
          <h1 
            className="text-[20vw] leading-none font-extrabold mb-16 tracking-tight text-[#F5F5F2]"
            style={{ fontFamily: getTitleFontFamily() }}
          >
            {t('app_title')}
          </h1>
          <button
            onClick={handleGetStarted}
            className="px-12 py-4 text-[#F5F5F2] rounded-full text-xl font-['Noto_Sans_Thai'] shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 button-gradient-animation"
          >
            {t('get_started')}
          </button>
        </div>
      </div>

      {/* Studio Commuan Branding and Copyright */}
      <div className="fixed bottom-8 z-50 w-full px-[10%]">
        <div className="flex justify-between items-end">
          {/* Studio Commuan */}
          <div className="flex items-center space-x-4">
            <div 
              className="w-16 h-16 rounded-full bg-[#E86F2C]/20 flex items-center justify-center"
              style={{
                animation: 'logoFade 10s ease-in-out infinite'
              }}
            >
              <span className="text-2xl text-[#F5F5F2]">SC</span>
            </div>
            <p className="text-sm text-left text-[#F5F5F2] max-w-[400px] opacity-80">
              Developed by Studio Commuan, experts in film technology with over a decade of experience.
            </p>
          </div>

          {/* Copyright */}
          <p className="text-sm text-[#F5F5F2] opacity-60">
            © 2025 LiQid. All rights reserved.
          </p>
        </div>
      </div>

      <style>
        {`
          @keyframes logoFade {
            0%, 100% { opacity: 0.8; }
            50% { opacity: 1; }
          }

          .nav-text-gradient {
            background: linear-gradient(
              90deg,
              #E86F2C 0%,
              #c7b81a 33%,
              #E86F2C 66%,
              #c7b81a 100%
            );
            background-size: 300% 100%;
            -webkit-background-clip: text;
            background-clip: text;
            -webkit-text-fill-color: transparent;
            animation: navTextGradient 15s linear infinite;
          }

          @keyframes navTextGradient {
            0% { background-position: 0% 50% }
            100% { background-position: 300% 50% }
          }
        `}
      </style>
    </div>
  );
}

export default LandingPage;