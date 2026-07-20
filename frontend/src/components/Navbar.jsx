import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import logoAstra from '../assets/logo-astra.png';
import './Navbar.css';

const Navbar = () => {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const closeMenu = () => setMenuOpen(false);

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <img src={logoAstra} alt="AstraZeneca" className="brand-logo" />
      </div>
      <button className="hamburger" onClick={() => setMenuOpen(o => !o)} aria-label="Menu">
        <span /><span /><span />
      </button>
      <div className={`navbar-collapse${menuOpen ? ' open' : ''}`}>
        <div className="navbar-links">
          <NavLink to="/dashboard" onClick={closeMenu} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Dashboard
          </NavLink>
          <NavLink to="/meetings" onClick={closeMenu} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Meetings
          </NavLink>
          {isAdmin && (
            <NavLink to="/admin/users" onClick={closeMenu} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Usuários
            </NavLink>
          )}
          {isAdmin && (
            <NavLink to="/admin/doctors" onClick={closeMenu} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Médicos
            </NavLink>
          )}
        </div>
        <div className="navbar-user">
          <span className="user-badge">{user?.role === 'admin' ? '👑 Admin' : '👤 ' + user?.name}</span>
          <button className="btn-logout" onClick={handleLogout}>Sair</button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
