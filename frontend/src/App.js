import React, { useState, useEffect, useCallback, useRef } from 'react';
import 'leaflet/dist/leaflet.css';  // ✅ FIX: must import BEFORE App.css to avoid tile breakage
import './App.css';
import { authAPI, issuesAPI, ownerAPI } from './services/api';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';

// Fix for default marker icon in leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

// ── THEMES ────────────────────────────────────────────────────────────────────
const THEMES = [
  { id: 'ocean',  label: '🌊 Ocean Blue',    color: '#2563eb' },
  { id: 'sunset', label: '🌅 Sunset Orange',  color: '#ea580c' },
  { id: 'forest', label: '🌲 Forest Green',   color: '#16a34a' },
  { id: 'purple', label: '💜 Purple Night',   color: '#7c3aed' },
  { id: 'rose',   label: '🌸 Rose Gold',      color: '#e11d48' },
];

// Rewards list (shared)
const REWARDS = [
  { id: 1, title: 'Free Coffee Voucher', cost: 50, icon: 'ri-cup-line', desc: 'Get a free coffee at any participating local cafe.' },
  { id: 2, title: 'Bus Day Pass', cost: 100, icon: 'ri-bus-line', desc: 'Valid for unlimited rides for one day on city transit.' },
  { id: 3, title: 'Movie Ticket', cost: 150, icon: 'ri-film-line', desc: 'One standard admission ticket to local cinemas.' },
  { id: 4, title: 'Grocery ₹500 Coupon', cost: 200, icon: 'ri-shopping-cart-line', desc: '₹500 off your next local grocery run.' },
  { id: 5, title: 'City Swag (T-Shirt)', cost: 250, icon: 'ri-t-shirt-line', desc: 'Exclusive CityFix contributor t-shirt.' },
  { id: 6, title: 'Museum Entry Pass', cost: 300, icon: 'ri-bank-line', desc: 'Free entry to the city art and history museum.' },
  { id: 7, title: 'Food Delivery Wallet ₹1000', cost: 350, icon: 'ri-restaurant-line', desc: 'Added directly to your favorite food delivery app.' },
  { id: 8, title: '1-Month Gym Pass', cost: 400, icon: 'ri-run-line', desc: 'Access to participating city fitness centers.' },
  { id: 9, title: 'Local Concert Ticket', cost: 450, icon: 'ri-music-2-line', desc: 'General admission to upcoming city-sponsored concerts.' },
  { id: 10, title: 'Train Month Pass', cost: 500, icon: 'ri-train-line', desc: 'Unlimited travel on city trains for 30 days.' },
  { id: 11, title: 'Bicycle Rental Weekend', cost: 550, icon: 'ri-riding-line', desc: 'Free city bike rental for a full weekend.' },
  { id: 12, title: 'Spa & Wellness Day', cost: 600, icon: 'ri-sparkling-fill', desc: 'A relaxing day pass at partner wellness centers.' },
  { id: 13, title: 'Amusement Park Pass', cost: 700, icon: 'ri-ferris-wheel-line', desc: 'Full day access to the city amusement park.' },
  { id: 14, title: 'Premium Tech Store ₹2500', cost: 850, icon: 'ri-macbook-line', desc: '₹2500 gift card for local electronics stores.' },
  { id: 15, title: 'Mayor for a Day Tour', cost: 1000, icon: 'ri-building-line', desc: 'Exclusive VIP tour of city hall and lunch with officials.' },
];

// ── TOAST ────────────────────────────────────────────────────────────────────
function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.type}`}>
      <span className="toast-text">{toast.message}</span>
    </div>
  );
}

// ── THEME SWITCHER ────────────────────────────────────────────────────────────
function ThemeSwitcher({ theme, setTheme }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="theme-switcher">
      <button className="theme-btn" onClick={() => setOpen(o => !o)} title="Change Theme">
        <i className="ri-palette-line"></i>
      </button>
      {open && (
        <div className="theme-dropdown">
          {THEMES.map(t => (
            <button
              key={t.id}
              className={`theme-option ${theme === t.id ? 'active' : ''}`}
              onClick={() => { setTheme(t.id); setOpen(false); }}
            >
              <span className="theme-dot" style={{ background: t.color }}></span>
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── IMAGE MODAL ───────────────────────────────────────────────────────────────
function ImageModal({ src, owner, onClose }) {
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="image-modal-overlay" onClick={onClose}>
      <button className="image-modal-close" onClick={onClose}>
        <i className="ri-close-line"></i>
      </button>
      <div className="image-modal-content" onClick={e => e.stopPropagation()} style={{ position: 'relative' }}>
        <img src={src} alt="Issue" className="image-modal-img" />
        {owner && (
          <div style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.75)', color: 'white', padding: '8px 16px', borderRadius: '24px', display: 'flex', alignItems: 'center', gap: '8px', zIndex: 100, fontSize: '0.95rem', backdropFilter: 'blur(4px)' }}>
            <i className="ri-user-line"></i> Uploaded by: {owner}
          </div>
        )}
      </div>
    </div>
  );
}

// ── MY REWARDS PANEL ──────────────────────────────────────────────────────────
function MyRewardsPanel({ claimedRewards, onClose }) {
  return (
    <div className="my-rewards-overlay" onClick={onClose}>
      <div className="my-rewards-panel" onClick={e => e.stopPropagation()}>
        <div className="my-rewards-header">
          <h3><i className="ri-gift-fill"></i> My Claimed Rewards</h3>
          <button className="modal-close" onClick={onClose} style={{ position: 'static' }}>×</button>
        </div>
        {claimedRewards.length === 0 ? (
          <div className="empty-state" style={{ padding: '2rem 1rem' }}>
            <i className="ri-inbox-2-line"></i>
            <p>No rewards claimed yet.<br />Earn points by reporting issues!</p>
          </div>
        ) : (
          <div className="my-rewards-list">
            {claimedRewards.map((r, i) => {
              const rewardInfo = REWARDS.find(rw => rw.cost === r.cost) || {};
              return (
                <div key={i} className="my-reward-item">
                  <div className="my-reward-icon">
                    <i className={rewardInfo.icon || 'ri-gift-line'}></i>
                  </div>
                  <div className="my-reward-info">
                    <strong>{r.title || rewardInfo.title || 'Reward'}</strong>
                    <span>{new Date(r.claimedAt).toLocaleDateString()}</span>
                  </div>
                  <div className="my-reward-cost">
                    <i className="ri-coin-fill"></i> {r.cost}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('cityfix_theme') || 'ocean');
  const [currentView, setCurrentView] = useState('landing');
  const [currentUser, setCurrentUser] = useState(null);
  const [issues, setIssues] = useState([]);
  const [filter, setFilter] = useState('all');
  const [showLogin, setShowLogin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [showMyRewards, setShowMyRewards] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(false);
  const profileDropdownRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);
  // Claimed rewards stored locally, updated per-user in a useEffect
  const [claimedRewards, setClaimedRewards] = useState([]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme === 'ocean' ? '' : theme);
    localStorage.setItem('cityfix_theme', theme);
  }, [theme]);

  useEffect(() => {
    const saved = localStorage.getItem('cityfix_user');
    let user = null;
    if (saved) {
      user = JSON.parse(saved);
      setCurrentUser(user);
    }
    fetchIssues();
    
    if (user?.email) {
      try {
        setClaimedRewards(JSON.parse(localStorage.getItem(`cityfix_claimed_rewards_${user.email}`) || '[]'));
      } catch {
        setClaimedRewards([]);
      }
    } else {
      setClaimedRewards([]);
    }
  }, []);

  useEffect(() => {
    if (currentUser?.email) {
      try {
        setClaimedRewards(JSON.parse(localStorage.getItem(`cityfix_claimed_rewards_${currentUser.email}`) || '[]'));
      } catch {
        setClaimedRewards([]);
      }
    } else {
      setClaimedRewards([]);
    }
  }, [currentUser?.email]);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchIssues = async () => {
    try {
      const res = await issuesAPI.getAll();
      setIssues(res.data);
    } catch { /* silent */ }
  };

  const handleLogin = async (email, password) => {
    setLoading(true);
    try {
      const res = await authAPI.login({ email, password });
      const { user, token } = res.data;
      setCurrentUser(user);
      localStorage.setItem('cityfix_user', JSON.stringify(user));
      localStorage.setItem('cityfix_token', token);
      setShowLogin(false);
      showToast(`Welcome, ${user.username}!`, 'success');
      if (user.role === 'owner') setCurrentView('owner');
    } catch (err) {
      showToast(err.response?.data?.error || 'Login failed', 'danger');
    } finally { setLoading(false); }
  };

  const handleRegister = async (username, email, password) => {
    setLoading(true);
    try {
      const res = await authAPI.register({ username, email, password });
      const { user, token } = res.data;
      setCurrentUser(user);
      localStorage.setItem('cityfix_user', JSON.stringify(user));
      localStorage.setItem('cityfix_token', token);
      setShowRegister(false);
      showToast(`Welcome to CityFix, ${user.username}!`, 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Registration failed', 'danger');
    } finally { setLoading(false); }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('cityfix_user');
    localStorage.removeItem('cityfix_token');
    window.location.reload();
  };

  const handleReportIssue = async (data) => {
    setLoading(true);
    try {
      await issuesAPI.create(data);
      await fetchIssues();
      setCurrentView('home');
      showToast('Issue reported successfully!', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to report issue', 'danger');
    } finally { setLoading(false); }
  };

  const handleClaimReward = async (reward) => {
    if (currentUser.points < reward.cost) {
      showToast(`You need ${reward.cost - currentUser.points} more points!`, 'warning');
      return;
    }
    try {
      setLoading(true);
      const res = await authAPI.claimReward({ cost: reward.cost, title: reward.title });
      const updatedUser = { ...currentUser, points: res.data.newPoints };
      setCurrentUser(updatedUser);
      localStorage.setItem('cityfix_user', JSON.stringify(updatedUser));
      // Save claimed reward locally
      const newClaimed = [
        ...claimedRewards,
        { title: reward.title, cost: reward.cost, claimedAt: new Date().toISOString() }
      ];
      setClaimedRewards(newClaimed);
      localStorage.setItem(`cityfix_claimed_rewards_${currentUser.email}`, JSON.stringify(newClaimed));
      showToast(`🎉 "${reward.title}" claimed! Check your email.`, 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to claim reward', 'danger');
    } finally {
      setLoading(false);
    }
  };

  const filteredIssues = filter === 'all' ? issues : issues.filter(i => i.status === filter);

  return (
    <div className="App">
      {/* NAVBAR */}
      <nav className="navbar">
        <div className="nav-content">
          <ThemeSwitcher theme={theme} setTheme={setTheme} />

          <a href="#landing" className="logo" onClick={(e) => { e.preventDefault(); setCurrentView('landing'); }}>
            <i className="ri-map-pin-user-fill"></i> City<span>Fix</span>
          </a>

          {currentUser?.role !== 'owner' && (
            <div className="nav-links">
              <a href="#home" onClick={() => setCurrentView('home')}
                className={currentView === 'home' ? 'nav-link active' : 'nav-link'}>
                <i className="ri-home-line"></i> Home
              </a>
              <a href="#report" onClick={() => setCurrentView('report')}
                className={currentView === 'report' ? 'nav-link active' : 'nav-link'}>
                <i className="ri-add-circle-line"></i> Report
              </a>
              <a href="#rewards" onClick={() => setCurrentView('rewards')}
                className={currentView === 'rewards' ? 'nav-link active' : 'nav-link'}>
                <i className="ri-gift-line"></i> Rewards
              </a>
            </div>
          )}

          <div className="nav-user">
            {!currentUser ? (
              <>
                <button className="btn btn-outline btn-sm" onClick={() => setShowLogin(true)}>Login</button>
                <button className="btn btn-primary btn-sm" onClick={() => setShowRegister(true)}>Sign Up</button>
              </>
            ) : currentUser.role === 'owner' ? (
              <>
                <div className="owner-badge"><i className="ri-shield-star-fill"></i> Owner</div>
                <button className="btn btn-outline btn-sm" onClick={handleLogout}>
                  <i className="ri-logout-box-line"></i> Logout
                </button>
              </>
            ) : (
              <div className="user-profile">
                <div className="points-badge">
                  <i className="ri-coin-fill"></i>
                  <span>{currentUser.points}</span>
                </div>
                <div className="profile-dropdown" ref={profileDropdownRef}>
                  <button className="profile-btn" onClick={() => setShowProfileMenu(!showProfileMenu)}>
                    <div className="avatar">{currentUser.username.charAt(0).toUpperCase()}</div>
                    <span>{currentUser.username}</span>
                    <i className="ri-arrow-down-s-line" style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}></i>
                  </button>
                  {showProfileMenu && (
                    <div className="dropdown-menu" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <a href="#my-rewards" onClick={e => { e.preventDefault(); setShowMyRewards(true); setShowProfileMenu(false); }}>
                        <i className="ri-gift-line"></i> My Rewards
                        {claimedRewards.length > 0 && (
                          <span className="dropdown-badge">{claimedRewards.length}</span>
                        )}
                      </a>
                      <div className="dropdown-divider"></div>
                      <a href="#logout" onClick={e => { e.preventDefault(); handleLogout(); }} style={{ color: 'var(--danger)' }}>
                        <i className="ri-logout-box-line"></i> Logout
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* MAIN CONTENT */}
      <main className="main-content">
        {currentView === 'landing' && (
          <LandingView onExplore={() => setCurrentView('home')} />
        )}
        {currentView === 'home' && (
          <HomeView
            issues={filteredIssues}
            filter={filter}
            setFilter={setFilter}
            onReportClick={() => setCurrentView('report')}
            currentUser={currentUser}
            onRateIssue={fetchIssues}
            showToast={showToast}
            allIssues={issues}
          />
        )}
        {currentView === 'report' && (
          <ReportView
            currentUser={currentUser}
            onSubmit={handleReportIssue}
            loading={loading}
            onLoginRequired={() => setShowLogin(true)}
            showToast={showToast}
          />
        )}
        {currentView === 'rewards' && (
          <RewardsView
            currentUser={currentUser}
            onLoginRequired={() => setShowLogin(true)}
            onClaimReward={handleClaimReward}
            loading={loading}
          />
        )}
        {currentView === 'owner' && currentUser?.role === 'owner' && (
          <OwnerDashboard showToast={showToast} />
        )}
      </main>

      {/* MODALS */}
      {showLogin && (
        <LoginModal
          onClose={() => setShowLogin(false)}
          onLogin={handleLogin}
          loading={loading}
          onSwitchToRegister={() => { setShowLogin(false); setShowRegister(true); }}
        />
      )}
      {showRegister && (
        <RegisterModal
          onClose={() => setShowRegister(false)}
          onRegister={handleRegister}
          loading={loading}
          onSwitchToLogin={() => { setShowRegister(false); setShowLogin(true); }}
        />
      )}
      {showMyRewards && (
        <MyRewardsPanel
          claimedRewards={claimedRewards}
          onClose={() => setShowMyRewards(false)}
        />
      )}

      <Toast toast={toast} />
    </div>
  );
}

// ── HOME VIEW ─────────────────────────────────────────────────────────────────
function HomeView({ issues, filter, setFilter, onReportClick, currentUser, onRateIssue, showToast, allIssues }) {
  const stats = {
    total: allIssues.length,
    inProgress: allIssues.filter(i => i.status === 'in-progress').length,
    solved: allIssues.filter(i => i.status === 'solved').length
  };

  const HOW_IT_WORKS = [
    {
      icon: 'ri-camera-line',
      step: '01',
      title: 'Spot & Report',
      desc: 'See a broken streetlight, pothole, or issue? Snap a photo and submit a report in seconds.'
    },
    {
      icon: 'ri-road-map-line',
      step: '02',
      title: 'Track Progress',
      desc: 'Follow your report from Pending → In Progress → Solved. Real-time updates keep you informed.'
    },
    {
      icon: 'ri-medal-line',
      step: '03',
      title: 'Earn Rewards',
      desc: 'Collect points for every verified report. Redeem them for city perks, vouchers & exclusive gifts.'
    },
  ];

  return (
    <section>
      {/* ── HERO ── */}
      <header className="hero-section">
        <div className="hero-left">
          <div className="hero-badge">
            <i className="ri-shield-check-line"></i> Trusted Community Platform
          </div>
          <h1>Make Your City Better,<br /><span>One Report at a Time.</span></h1>
          <p>Spot a pothole? Broken streetlight? Garbage pileup? Report it instantly and track the resolution in real-time.</p>
          <div className="hero-actions">
            <button className="btn btn-primary btn-lg" onClick={onReportClick}>
              <i className="ri-add-circle-line"></i> Report an Issue
            </button>
            <div className="hero-trust">
              <div className="trust-avatars">
                {['R', 'M', 'S', 'K'].map((c, i) => (
                  <div key={i} className="trust-avatar" style={{ zIndex: 4 - i }}>{c}</div>
                ))}
              </div>
              <span>{stats.total > 0 ? `${stats.total}+ issues reported` : 'Be the first reporter!'}</span>
            </div>
          </div>
        </div>

        <div className="hero-right">
          <div className="hero-stats-grid">
            <div className="stat-card hero-stat-card">
              <i className="ri-file-list-3-line stat-icon"></i>
              <h3>{stats.total}</h3>
              <p>Issues Reported</p>
            </div>
            <div className="stat-card hero-stat-card accent-stat">
              <i className="ri-tools-line stat-icon"></i>
              <h3>{stats.inProgress}</h3>
              <p>In Progress</p>
            </div>
            <div className="stat-card hero-stat-card success-stat span-2">
              <i className="ri-checkbox-circle-line stat-icon"></i>
              <h3>{stats.solved}</h3>
              <p>Issues Solved 🎉</p>
            </div>
          </div>
        </div>
      </header>

      {/* ── HOW IT WORKS ── */}
      <div className="section-label">
        <span className="section-pill">How It Works</span>
      </div>
      <div className="how-it-works">
        {HOW_IT_WORKS.map((item) => (
          <div key={item.step} className="how-card">
            <div className="how-step">{item.step}</div>
            <div className="how-icon-wrap">
              <i className={item.icon}></i>
            </div>
            <h3>{item.title}</h3>
            <p>{item.desc}</p>
          </div>
        ))}
      </div>

      {/* ── ISSUE FEED ── */}
      <div className="feed-header">
        <div>
          <h2>Recent Reports</h2>
          <p className="feed-subtitle">Latest community-submitted issues across the city</p>
        </div>
        <div className="filter-tabs">
          {['all', 'pending', 'in-progress', 'solved'].map(f => (
            <button key={f} className={filter === f ? 'filter-btn active' : 'filter-btn'} onClick={() => setFilter(f)}>
              {f === 'all' ? '🗂 All' : f === 'pending' ? '⏳ Pending' : f === 'in-progress' ? '🔧 In Progress' : '✅ Solved'}
            </button>
          ))}
        </div>
      </div>

      {issues.length === 0 ? (
        <div className="empty-state">
          <i className="ri-inbox-2-line"></i>
          <p>No issues found. {filter !== 'all' ? 'Try changing the filter.' : 'Be the first to report!'}</p>
        </div>
      ) : (
        <div className="issue-grid">
          {issues.map(issue => (
            <IssueCard key={issue.id} issue={issue} showEmail={false} currentUser={currentUser} onRateIssue={onRateIssue} showToast={showToast} />
          ))}
        </div>
      )}
    </section>
  );
}

// ── ISSUE CARD ────────────────────────────────────────────────────────────────
function IssueCard({ issue, showEmail = false, onStatusChange, currentUser, onRateIssue, showToast, onDelete }) {
  const statusKey = issue.status?.replace('-', '-') || 'pending';
  const [ratingLoading, setRatingLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);

  const handleRate = async (rating) => {
    if (!onRateIssue) return;
    setRatingLoading(true);
    try {
      await issuesAPI.rate(issue.id, rating);
      if (showToast) showToast('Thanks for your rating!', 'success');
      onRateIssue();
    } catch (err) {
      if (showToast) showToast(err.response?.data?.error || 'Failed to rate', 'danger');
    } finally { setRatingLoading(false); }
  };

  return (
    <>
      {previewData && <ImageModal src={previewData.src} owner={previewData.owner} onClose={() => setPreviewData(null)} />}
      <div className="issue-card">
        <div
          className={`card-img${issue.image ? ' card-img-clickable' : ''}`}
          style={{
            background: issue.image
              ? `url(${issue.image}) center/cover no-repeat`
              : `linear-gradient(135deg, var(--bg-card), var(--bg))`
          }}
          onClick={() => issue.image && setPreviewData({ src: issue.image, owner: issue.userName || 'Anonymous' })}
          title={issue.image ? 'Click to enlarge' : ''}
        >
          {!issue.image && (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="ri-image-line" style={{ fontSize: '2.5rem', opacity: 0.3 }}></i>
            </div>
          )}
          {issue.image && (
            <div className="img-zoom-hint"><i className="ri-zoom-in-line"></i></div>
          )}
        </div>
        <div className="card-body">
          <span className={`status-badge status-${statusKey}`}>{issue.status}</span>
          <h3 className="card-title">{issue.type}</h3>
          <div className="card-info">
            <i className="ri-map-pin-line"></i> 
            <a 
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(issue.location)}`} 
              target="_blank" 
              rel="noreferrer"
              style={{ color: 'inherit', textDecoration: 'underline' }}
            >
              {issue.location}
            </a>
          </div>
          <div className="card-info"><i className="ri-calendar-line"></i> {new Date(issue.date).toLocaleDateString()}</div>
          <div className="card-info"><i className="ri-user-line"></i> {issue.userName || 'Anonymous'}</div>
          {showEmail && issue.reporter_email && (
            <div className="card-info owner-email"><i className="ri-mail-line"></i> {issue.reporter_email}</div>
          )}
          <p className="card-desc">{issue.description}</p>

          {issue.status === 'solved' && issue.rating && (
            <div className="rating-display" style={{ marginTop: '0.5rem', color: '#f59e0b', fontSize: '1.2rem' }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <i key={i} className={i < issue.rating ? "ri-star-fill" : "ri-star-line"}></i>
              ))}
            </div>
          )}

          {issue.status === 'solved' && !issue.rating && currentUser && !showEmail && currentUser.id === issue.userId && (
            <div className="rating-action">
              <p style={{ fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Rate this solution:</p>
              {ratingLoading ? (
                <span style={{ fontSize: '0.85rem' }}><i className="ri-loader-4-line"></i> Submitting...</span>
              ) : (
                <div style={{ display: 'flex', gap: '0.25rem', color: '#f59e0b', cursor: 'pointer', fontSize: '1.4rem' }}>
                  {[1, 2, 3, 4, 5].map(r => (
                    <i key={r} className="ri-star-line star-hover" onClick={() => handleRate(r)}
                       onMouseEnter={(e) => e.target.className = "ri-star-fill star-hover"}
                       onMouseLeave={(e) => e.target.className = "ri-star-line star-hover"}></i>
                  ))}
                </div>
              )}
            </div>
          )}

          {onStatusChange && (
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <select
                className="status-select"
                value={issue.status}
                onChange={e => onStatusChange(issue.id, e.target.value)}
                style={{ flex: 1 }}
              >
                <option value="pending">Pending</option>
                <option value="in-progress">In Progress</option>
                <option value="solved">Solved</option>
              </select>
              {onDelete && (
                <button className="btn btn-danger btn-sm" onClick={() => onDelete(issue.id)} title="Delete Issue">
                  <i className="ri-delete-bin-line"></i>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── MAP: FLY TO MARKER ────────────────────────────────────────────────────────
function FlyToMarker({ position, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.flyTo([position.lat, position.lng], zoom || map.getZoom(), { duration: 1.5 });
    }
  }, [position, zoom, map]);
  return null;
}

// ── LOCATION AUTOCOMPLETE INPUT ───────────────────────────────────────────────
function LocationAutocomplete({ value, onChange, onSelect, placeholder }) {
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);
  const wrapRef = useRef(null);

  const search = (query) => {
    if (!query || query.length < 3) { setSuggestions([]); return; }
    setSearching(true);
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=6`)
      .then(r => r.json())
      .then(data => {
        setSuggestions(data || []);
        setShowDropdown(true);
      })
      .catch(() => setSuggestions([]))
      .finally(() => setSearching(false));
  };

  const handleInput = (e) => {
    const v = e.target.value;
    onChange(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(v), 350);
  };

  const handleSelect = (item) => {
    onChange(item.display_name);
    setSuggestions([]);
    setShowDropdown(false);
    onSelect({ lat: parseFloat(item.lat), lng: parseFloat(item.lon), name: item.display_name });
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setShowDropdown(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="autocomplete-wrap" ref={wrapRef}>
      <div className="autocomplete-input-wrap">
        <input
          type="text"
          value={value}
          onChange={handleInput}
          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
          placeholder={placeholder || 'Search city, place or address...'}
          autoComplete="off"
        />
        {searching && <i className="ri-loader-4-line autocomplete-spinner"></i>}
        {!searching && value && <i className="ri-search-line autocomplete-search-icon"></i>}
      </div>
      {showDropdown && suggestions.length > 0 && (
        <div className="autocomplete-dropdown">
          {suggestions.map((item, i) => (
            <button key={i} className="autocomplete-item" onMouseDown={() => handleSelect(item)}>
              <i className="ri-map-pin-line"></i>
              <span>{item.display_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── LOCATION MARKER ───────────────────────────────────────────────────────────
function LocationMarker({ position, setPosition, setLocationName }) {
  useMapEvents({
    click(e) {
      setPosition(e.latlng);
      fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${e.latlng.lat}&lon=${e.latlng.lng}`)
        .then(res => res.json())
        .then(data => { if (data?.display_name) setLocationName(data.display_name); })
        .catch(err => console.error('Geocoding error:', err));
    },
  });
  return position === null ? null : <Marker position={position}></Marker>;
}

// ── REPORT VIEW ───────────────────────────────────────────────────────────────
function ReportView({ currentUser, onSubmit, loading, onLoginRequired, showToast }) {
  const [type, setType] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  const INDIA_CENTER = { lat: 20.5937, lng: 78.9629 };
  const [position, setPosition] = useState(INDIA_CENTER);
  const [flyTarget, setFlyTarget] = useState(null);
  const [flyZoom, setFlyZoom] = useState(null);
  const [searchValue, setSearchValue] = useState('');

  if (!currentUser) {
    return (
      <div className="form-container" style={{ textAlign: 'center' }}>
        <i className="ri-lock-line" style={{ fontSize: '3rem', color: 'var(--text-muted)', marginBottom: '1rem' }}></i>
        <h2 style={{ marginBottom: 8 }}>Login Required</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>You must be logged in to report an issue.</p>
        <button className="btn btn-primary" onClick={onLoginRequired}>
          <i className="ri-user-line"></i> Login to Report
        </button>
      </div>
    );
  }

  const handleImage = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => { setImage(reader.result); setImagePreview(reader.result); };
    reader.readAsDataURL(file);
  };

  const handleLocationSelect = (selected) => {
    setPosition({ lat: selected.lat, lng: selected.lng });
    setFlyTarget({ lat: selected.lat, lng: selected.lng });
    setFlyZoom(14);
    setLocation(selected.name);
    setSearchValue(selected.name);
  };

  const handleMapPositionChange = (pos) => {
    setPosition(pos);
    setFlyTarget(pos);
    setFlyZoom(14);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ type, location, description, image, lat: position.lat, lng: position.lng });
  };

  return (
    <div className="form-container">
      <div className="form-header">
        <h2><i className="ri-edit-2-line"></i> Report an Issue</h2>
        <p>Fill in the details below to alert the authorities.</p>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Issue Type</label>
          <select value={type} onChange={e => setType(e.target.value)} required>
            <option value="">Select issue type</option>
            {['Road Damage', 'Street Light', 'Garbage', 'Water Leak', 'Drainage', 'Fallen Tree', 'Illegal Dumping', 'Other'].map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* ── AUTOCOMPLETE LOCATION SEARCH ── */}
        <div className="form-group">
          <label>Search Location <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(type to get suggestions)</span></label>
          <LocationAutocomplete
            value={searchValue}
            onChange={setSearchValue}
            onSelect={handleLocationSelect}
            placeholder="e.g. Anna Nagar, Chennai..."
          />
          <p className="form-hint">
            <i className="ri-information-line"></i> Select from suggestions, or click directly on the map to pin the location
          </p>
        </div>

        {/* ── MAP ── */}
        <div className="form-group">
          <div className="map-wrapper">
            <MapContainer
              center={[INDIA_CENTER.lat, INDIA_CENTER.lng]}
              zoom={5}
              style={{ height: '340px', width: '100%' }}
              scrollWheelZoom={true}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <LocationMarker
                position={position}
                setPosition={handleMapPositionChange}
                setLocationName={(name) => { setLocation(name); setSearchValue(name); }}
              />
              {flyTarget && <FlyToMarker position={flyTarget} zoom={flyZoom} />}
            </MapContainer>
          </div>
        </div>

        <div className="form-group">
          <label>Selected Location <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(auto-filled, edit if needed)</span></label>
          <input type="text" value={location} onChange={e => setLocation(e.target.value)}
            placeholder="e.g. Main St near Park Ave" required />
        </div>

        <div className="form-group">
          <label>Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Describe the issue in detail..." required rows={4} />
        </div>

        <div className="form-group">
          <label>Photo <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
          <input type="file" accept="image/*" onChange={handleImage} />
          {imagePreview && (
            <div className="img-preview-wrap">
              <img src={imagePreview} alt="Preview" className="img-preview" />
              <button type="button" className="img-preview-remove" onClick={() => { setImage(null); setImagePreview(null); }}>
                <i className="ri-close-circle-fill"></i>
              </button>
            </div>
          )}
        </div>

        <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
          {loading ? <><i className="ri-loader-4-line"></i> Submitting...</> : <><i className="ri-send-plane-line"></i> Submit Report</>}
        </button>
      </form>
    </div>
  );
}

// ── REWARDS VIEW ──────────────────────────────────────────────────────────────
function RewardsView({ currentUser, onLoginRequired, onClaimReward, loading }) {
  if (!currentUser) {
    return (
      <div className="empty-state">
        <i className="ri-lock-line"></i>
        <p>You must be logged in to view and claim rewards.</p>
        <button className="btn btn-primary" onClick={onLoginRequired} style={{ marginTop: '1rem' }}>
          Login
        </button>
      </div>
    );
  }

  return (
    <section>
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h2><i className="ri-gift-fill" style={{ color: 'var(--primary)' }}></i> Reward Center</h2>
        <p style={{ color: 'var(--text-muted)', marginTop: '0.4rem' }}>Redeem your hard-earned points for exciting local perks!</p>
        <div style={{ display: 'inline-block', marginTop: '1rem', padding: '1rem 2rem', background: 'var(--bg-card)', borderRadius: '12px' }}>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Your Balance</span>
          <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
            <i className="ri-coin-fill"></i> {currentUser.points}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem', padding: '0 1rem' }}>
        {REWARDS.map(reward => {
          const canAfford = currentUser.points >= reward.cost;
          return (
            <div key={reward.id} style={{
              background: 'var(--bg-card)', borderRadius: '16px', padding: '1.5rem',
              display: 'flex', flexDirection: 'column',
              borderTop: canAfford ? '4px solid var(--accent)' : '4px solid var(--border)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ width: '50px', height: '50px', borderRadius: '12px', background: 'var(--bg-card-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className={reward.icon} style={{ fontSize: '1.8rem', color: canAfford ? 'var(--primary)' : 'var(--text-muted)' }}></i>
                </div>
                <div style={{ color: canAfford ? 'var(--accent)' : 'var(--text-muted)', padding: '4px 12px', borderRadius: '20px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg)' }}>
                  <i className="ri-coin-fill"></i> {reward.cost}
                </div>
              </div>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>{reward.title}</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', flexGrow: 1, marginBottom: '1.5rem' }}>{reward.desc}</p>
              <button
                className={`btn ${canAfford ? 'btn-primary' : 'btn-outline'}`}
                style={{ width: '100%', opacity: canAfford ? 1 : 0.6 }}
                onClick={() => onClaimReward(reward)}
                disabled={!canAfford || loading}
              >
                {canAfford ? (loading ? 'Processing...' : <><i className="ri-gift-line"></i> Redeem</>) : `Earn ${reward.cost - currentUser.points} more pts`}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── OWNER DASHBOARD ───────────────────────────────────────────────────────────
function OwnerDashboard({ showToast }) {
  const [tab, setTab] = useState('issues');
  const [issues, setIssues] = useState([]);
  const [users, setUsers] = useState([]);
  const [loadingIssues, setLoadingIssues] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);

  const fetchOwnerIssues = useCallback(async () => {
    setLoadingIssues(true);
    try { const res = await ownerAPI.getIssues(); setIssues(res.data); }
    catch { showToast('Failed to load issues', 'danger'); }
    finally { setLoadingIssues(false); }
  }, [showToast]);

  const fetchOwnerUsers = useCallback(async () => {
    setLoadingUsers(true);
    try { const res = await ownerAPI.getUsers(); setUsers(res.data); }
    catch { showToast('Failed to load users', 'danger'); }
    finally { setLoadingUsers(false); }
  }, [showToast]);

  useEffect(() => { fetchOwnerIssues(); fetchOwnerUsers(); }, [fetchOwnerIssues, fetchOwnerUsers]);

  const handleStatusChange = async (id, status) => {
    try {
      await ownerAPI.updateStatus(id, status);
      setIssues(prev => prev.map(i => i.id === id ? { ...i, status } : i));
      showToast('Status updated! Email sent to reporter if solved.', 'success');
    } catch { showToast('Failed to update status', 'danger'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this issue?')) return;
    try { await ownerAPI.deleteIssue(id); setIssues(prev => prev.filter(i => i.id !== id)); showToast('Issue deleted', 'info'); }
    catch { showToast('Failed to delete issue', 'danger'); }
  };

  const stats = {
    total: issues.length,
    pending: issues.filter(i => i.status === 'pending').length,
    inProgress: issues.filter(i => i.status === 'in-progress').length,
    solved: issues.filter(i => i.status === 'solved').length,
    users: users.length
  };

  return (
    <section>
      <div className="owner-header">
        <div>
          <h1><i className="ri-dashboard-3-line"></i> Owner Dashboard</h1>
          <p>Manage all reported issues and view registered users</p>
        </div>
      </div>

      <div className="stats-row">
        {[
          { label: 'Total Issues', val: stats.total, icon: 'ri-file-list-3-line' },
          { label: 'Pending', val: stats.pending, icon: 'ri-time-line' },
          { label: 'In Progress', val: stats.inProgress, icon: 'ri-tools-line' },
          { label: 'Solved', val: stats.solved, icon: 'ri-checkbox-circle-line' },
          { label: 'Users', val: stats.users, icon: 'ri-group-line' },
        ].map(s => (
          <div className="stat-mini" key={s.label}>
            <i className={s.icon} style={{ fontSize: '1.5rem', color: 'var(--primary)', marginBottom: 4 }}></i>
            <h3>{s.val}</h3>
            <p>{s.label}</p>
          </div>
        ))}
      </div>

      <div className="owner-tabs">
        <button className={tab === 'issues' ? 'owner-tab active' : 'owner-tab'} onClick={() => setTab('issues')}>
          <i className="ri-alert-line"></i> Issues
        </button>
        <button className={tab === 'users' ? 'owner-tab active' : 'owner-tab'} onClick={() => setTab('users')}>
          <i className="ri-group-line"></i> Users
        </button>
      </div>

      {tab === 'issues' && (
        loadingIssues ? <div className="empty-state"><i className="ri-loader-4-line"></i><p>Loading...</p></div> :
        issues.length === 0 ? <div className="empty-state"><i className="ri-inbox-2-line"></i><p>No issues yet.</p></div> :
        <div className="issue-grid" style={{ padding: '0 1rem', marginTop: '1rem' }}>
          {issues.map(issue => (
            <IssueCard 
              key={issue.id} 
              issue={{
                ...issue,
                userName: issue.reporter_name // mapping for IssueCard compatibility
              }} 
              showEmail={true} 
              onStatusChange={handleStatusChange} 
              onDelete={handleDelete}
              showToast={showToast} 
            />
          ))}
        </div>
      )}

      {tab === 'users' && (
        loadingUsers ? <div className="empty-state"><i className="ri-loader-4-line"></i><p>Loading...</p></div> :
        users.length === 0 ? <div className="empty-state"><i className="ri-group-line"></i><p>No users yet.</p></div> :
        <div className="owner-table-wrap">
          <table className="owner-table">
            <thead>
              <tr>
                <th>Username</th><th>Email</th><th>Points</th><th>Reports</th><th>Solved</th><th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="avatar" style={{ width: 28, height: 28, fontSize: '0.8rem' }}>
                        {user.username.charAt(0).toUpperCase()}
                      </div>
                      {user.username}
                    </div>
                  </td>
                  <td className="owner-email">{user.email}</td>
                  <td><span style={{ color: 'var(--accent)', fontWeight: 700 }}>{user.points}</span></td>
                  <td>{user.total_reports}</td>
                  <td>{user.solved_reports}</td>
                  <td>{new Date(user.joined).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ── LOGIN MODAL ───────────────────────────────────────────────────────────────
function LoginModal({ onClose, onLogin, loading, onSwitchToRegister }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <div className="modal-icon"><i className="ri-user-line"></i></div>
        <h2>Welcome Back!</h2>
        <p>Login to track your reports and earn points</p>
        <form onSubmit={e => { e.preventDefault(); onLogin(email, password); }}>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password" required />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
        <p className="modal-footer">
          Don't have an account? <a href="#register" onClick={e => { e.preventDefault(); onSwitchToRegister(); }}>Sign Up</a>
        </p>
      </div>
    </div>
  );
}

// ── REGISTER MODAL ────────────────────────────────────────────────────────────
function RegisterModal({ onClose, onRegister, loading, onSwitchToLogin }) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <div className="modal-icon"><i className="ri-user-add-line"></i></div>
        <h2>Create Account</h2>
        <p>Join CityFix and help improve your community!</p>
        <form onSubmit={e => { e.preventDefault(); onRegister(username, email, password); }}>
          <div className="form-group">
            <label>Username</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)}
              placeholder="Choose a username" required minLength={3} />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com" required />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Min 4 characters" required minLength={4} />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Creating account...' : 'Sign Up'}
          </button>
        </form>
        <p className="modal-footer">
          Already have an account? <a href="#login" onClick={e => { e.preventDefault(); onSwitchToLogin(); }}>Login</a>
        </p>
      </div>
    </div>
  );
}

// ── LANDING VIEW ──────────────────────────────────────────────────────────────
function LandingView({ onExplore }) {
  return (
    <div className="landing-view">
      <div className="landing-content">
        <h1 className="landing-quote">"The greatness of a community is most accurately measured by the compassionate actions of its members."</h1>
        <p className="landing-subquote">- Coretta Scott King</p>
        
        <div className="landing-image-wrap">
          <img src="https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?auto=format&fit=crop&w=1000&q=80" alt="Beautiful City" className="landing-image" />
        </div>

        <button className="btn btn-primary btn-lg explore-btn" onClick={onExplore}>
          Explore CityFix <i className="ri-arrow-right-line"></i>
        </button>
      </div>
    </div>
  );
}

export default App;
