/**
 * NodeCast TV Application Entry Point
 */

class App {
    constructor() {
        this.currentPage = 'home';
        this.pages = {};
        this.currentUser = null;
        this.miniPlayer = { active: false, type: null, video: null, originalParent: null, originalNextSibling: null };

        // Initialize components
        this.player = new VideoPlayer();
        this.channelList = new ChannelList();
        this.sourceManager = new SourceManager();
        this.epgGuide = new EpgGuide();

        // Initialize page controllers
        this.pages.home = new HomePage(this);
        this.pages.live = new LivePage(this);
        this.pages.guide = new GuidePage(this);
        this.pages.movies = new MoviesPage(this);
        this.pages.series = new SeriesPage(this);
        this.pages.settings = new SettingsPage(this);
        this.pages.watch = new WatchPage(this);

        this.init();
    }

    async init() {
        // Check authentication first
        await this.checkAuth();

        // Mobile menu toggle
        const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
        const navbarMenu = document.getElementById('navbar-menu');

        if (mobileMenuToggle && navbarMenu) {
            mobileMenuToggle.addEventListener('click', () => {
                mobileMenuToggle.classList.toggle('active');
                navbarMenu.classList.toggle('active');
            });

            // Close menu when a nav link is clicked
            document.querySelectorAll('.nav-link').forEach(link => {
                link.addEventListener('click', () => {
                    mobileMenuToggle.classList.remove('active');
                    navbarMenu.classList.remove('active');
                });
            });

            // Close menu when clicking outside
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.navbar')) {
                    mobileMenuToggle.classList.remove('active');
                    navbarMenu.classList.remove('active');
                }
            });
        }

        // Channel drawer toggle (mobile)
        const channelToggleBtn = document.getElementById('channel-toggle-btn');
        const channelSidebar = document.getElementById('channel-sidebar');
        const channelOverlay = document.getElementById('channel-sidebar-overlay');

        if (channelToggleBtn && channelSidebar && channelOverlay) {
            const toggleChannelDrawer = () => {
                channelSidebar.classList.toggle('active');
                channelOverlay.classList.toggle('active');
            };

            channelToggleBtn.addEventListener('click', toggleChannelDrawer);
            channelOverlay.addEventListener('click', toggleChannelDrawer);

            // Close drawer when a channel is selected
            channelSidebar.addEventListener('click', (e) => {
                if (e.target.closest('.channel-item')) {
                    // Small delay to let the channel selection happen
                    setTimeout(() => {
                        channelSidebar.classList.remove('active');
                        channelOverlay.classList.remove('active');
                    }, 300);
                }
            });
        }

        // Desktop sidebar collapse toggle
        const sidebarCollapseBtn = document.getElementById('sidebar-collapse-btn');
        const sidebarExpandBtn = document.getElementById('sidebar-expand-btn');
        const homeLayout = document.querySelector('.home-layout');

        const toggleSidebarCollapse = () => {
            channelSidebar?.classList.toggle('collapsed');
            homeLayout?.classList.toggle('sidebar-collapsed');

            // Persist preference
            const isCollapsed = channelSidebar?.classList.contains('collapsed');
            localStorage.setItem('sidebarCollapsed', isCollapsed ? 'true' : 'false');
        };

        sidebarCollapseBtn?.addEventListener('click', toggleSidebarCollapse);
        sidebarExpandBtn?.addEventListener('click', toggleSidebarCollapse);

        // Restore sidebar state from localStorage
        if (localStorage.getItem('sidebarCollapsed') === 'true') {
            channelSidebar?.classList.add('collapsed');
            homeLayout?.classList.add('sidebar-collapsed');
        }

        // Drag-to-resize the category sidebar (desktop layout only - on mobile
        // .channel-sidebar becomes a fixed-width drawer, not something to widen)
        const SIDEBAR_WIDTH_KEY = 'nodecast_tv_sidebar_width';
        const SIDEBAR_MIN_WIDTH = 220;
        const SIDEBAR_MAX_WIDTH = 600;
        const isDesktopLayout = () => window.matchMedia('(min-width: 769px)').matches;
        const resizeHandle = document.getElementById('sidebar-resize-handle');

        const savedSidebarWidth = parseInt(localStorage.getItem(SIDEBAR_WIDTH_KEY), 10);
        if (isDesktopLayout() && savedSidebarWidth >= SIDEBAR_MIN_WIDTH && savedSidebarWidth <= SIDEBAR_MAX_WIDTH) {
            document.documentElement.style.setProperty('--sidebar-width', `${savedSidebarWidth}px`);
        }

        if (resizeHandle && channelSidebar) {
            let startX = 0;
            let startWidth = 0;

            const onPointerMove = (e) => {
                const delta = e.clientX - startX;
                const maxWidth = Math.min(SIDEBAR_MAX_WIDTH, window.innerWidth - 300);
                const newWidth = Math.min(maxWidth, Math.max(SIDEBAR_MIN_WIDTH, startWidth + delta));
                document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`);
            };

            const onPointerUp = () => {
                document.removeEventListener('pointermove', onPointerMove);
                document.removeEventListener('pointerup', onPointerUp);
                document.body.classList.remove('resizing-sidebar');
                resizeHandle.classList.remove('dragging');

                const finalWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width'), 10);
                if (finalWidth) {
                    localStorage.setItem(SIDEBAR_WIDTH_KEY, finalWidth);
                }
            };

            resizeHandle.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                startX = e.clientX;
                startWidth = channelSidebar.getBoundingClientRect().width;
                document.body.classList.add('resizing-sidebar');
                resizeHandle.classList.add('dragging');
                document.addEventListener('pointermove', onPointerMove);
                document.addEventListener('pointerup', onPointerUp);
            });

            // Double-click to reset to the default width
            resizeHandle.addEventListener('dblclick', () => {
                document.documentElement.style.removeProperty('--sidebar-width');
                localStorage.removeItem(SIDEBAR_WIDTH_KEY);
            });

            // Re-clamp on resize/rotation - a width picked on a wide window
            // could otherwise crowd out the video once the window narrows
            window.addEventListener('resize', () => {
                if (!isDesktopLayout()) {
                    document.documentElement.style.removeProperty('--sidebar-width');
                    return;
                }
                const current = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width'), 10);
                const maxWidth = Math.min(SIDEBAR_MAX_WIDTH, window.innerWidth - 300);
                if (current > maxWidth) {
                    document.documentElement.style.setProperty('--sidebar-width', `${Math.max(SIDEBAR_MIN_WIDTH, maxWidth)}px`);
                }
            });
        }

        this.setupMiniPlayer();

        // Navigation handling
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.navigateTo(link.dataset.page);
            });
        });

        // Now Playing indicator
        const nowPlayingBtn = document.getElementById('now-playing-indicator');
        if (nowPlayingBtn) {
            nowPlayingBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.navigateTo('watch');
            });
        }

        // Toggle groups button
        document.getElementById('toggle-groups').addEventListener('click', () => {
            this.channelList.toggleAllGroups();
        });

        // Search clear buttons (global handler for all)
        document.querySelectorAll('.search-clear').forEach(btn => {
            btn.addEventListener('click', () => {
                const wrapper = btn.closest('.search-wrapper');
                const input = wrapper?.querySelector('.search-input');
                if (input) {
                    input.value = '';
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.focus();
                }
            });
        });

        // Handle browser back/forward buttons
        window.addEventListener('popstate', (e) => {
            const page = e.state?.page || 'home';
            this.navigateTo(page, false); // false = don't add to history
        });

        // Initialize home page first (it's needed for channel list)
        await this.pages.home.init();

        // Preload EPG data in background (non-blocking)
        // This ensures EPG info is available on Live TV page without visiting Guide first
        this.epgGuide.loadEpg().catch(err => {
            console.warn('Background EPG load failed:', err.message);
        });

        // Navigate to the page from URL hash, or default to home
        const hash = window.location.hash.slice(1); // Remove #
        const initialPage = hash && this.pages[hash] ? hash : 'home';
        this.navigateTo(initialPage, true); // true = replace history (don't add)

        console.log('NodeCast TV initialized');
    }

    async checkAuth() {
        const token = localStorage.getItem('authToken');

        if (!token) {
            // No token, redirect to login (replace to avoid back button issues)
            window.location.replace('/login.html');
            return;
        }

        try {
            // Verify token with server
            const response = await fetch('/api/auth/me', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Invalid token');
            }

            this.currentUser = await response.json();

            // Hide settings for viewers
            if (this.currentUser.role === 'viewer') {
                const settingsLink = document.querySelector('.nav-link[data-page="settings"]');
                if (settingsLink) {
                    settingsLink.style.display = 'none';
                }
            }

            // Add logout button to navbar
            this.addLogoutButton();

        } catch (err) {
            console.error('Authentication error:', err);
            localStorage.removeItem('authToken');
            window.location.replace('/login.html');
        }
    }

    addLogoutButton() {
        const navbar = document.querySelector('.navbar-menu');
        if (!navbar || document.getElementById('logout-btn')) return;

        const logoutLink = document.createElement('a');
        logoutLink.href = '#';
        logoutLink.className = 'nav-link';
        logoutLink.id = 'logout-btn';
        logoutLink.innerHTML = `
            <span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="icon">
                <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
            </svg></span>
            <span>Logout</span>
        `;

        logoutLink.addEventListener('click', async (e) => {
            e.preventDefault();

            const token = localStorage.getItem('authToken');
            if (token) {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
            }

            localStorage.removeItem('authToken');
            window.location.replace('/login.html');
        });

        navbar.appendChild(logoutLink);
    }

    navigateTo(pageName, replaceHistory = false) {
        // Don't navigate if already on this page
        if (this.currentPage === pageName && !replaceHistory) {
            return;
        }

        // Update browser history
        if (replaceHistory) {
            // Replace current history entry (used on initial load)
            history.replaceState({ page: pageName }, '', `#${pageName}`);
        } else {
            // Add new history entry
            history.pushState({ page: pageName }, '', `#${pageName}`);
        }

        // Update nav
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.toggle('active', link.dataset.page === pageName);
        });

        // Update pages
        document.querySelectorAll('.page').forEach(page => {
            page.classList.toggle('active', page.id === `page-${pageName}`);
        });

        // Leaving Live TV or Watch while something is playing: float it into the
        // mini-player instead of leaving it playing invisibly behind a hidden page
        if ((this.currentPage === 'live' || this.currentPage === 'watch') && this.currentPage !== pageName) {
            this.minimizePlayer(this.currentPage);
        }

        // Coming back to the page whose player is currently floating: dock it back inline
        if (this.miniPlayer.active && this.miniPlayer.type === pageName) {
            this.restoreMiniPlayer();
        }

        // Notify page controllers
        if (this.pages[this.currentPage]?.hide) {
            this.pages[this.currentPage].hide();
        }

        this.currentPage = pageName;

        if (this.pages[pageName]?.show) {
            this.pages[pageName].show();
        }
    }

    setupMiniPlayer() {
        const box = document.getElementById('mini-player');
        const slot = document.getElementById('mini-player-video-slot');
        if (!box || !slot) return;

        const goToSource = () => {
            if (this.miniPlayer.active) this.navigateTo(this.miniPlayer.type);
        };

        slot.addEventListener('click', goToSource);
        document.getElementById('mini-player-expand').addEventListener('click', (e) => {
            e.stopPropagation();
            goToSource();
        });

        document.getElementById('mini-player-playpause').addEventListener('click', (e) => {
            e.stopPropagation();
            const video = this.miniPlayer.video;
            if (!video) return;
            if (video.paused) video.play().catch(() => { });
            else video.pause();
        });

        document.getElementById('mini-player-close').addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeMiniPlayer();
        });

        // Keep the play/pause icon in sync regardless of what caused the change
        // (mini-player button, the page it came from, autoplay, network stalls, ...)
        [this.player?.video, this.pages.watch?.video].forEach(video => {
            if (!video) return;
            ['play', 'pause'].forEach(evt => {
                video.addEventListener(evt, () => {
                    if (this.miniPlayer.active && this.miniPlayer.video === video) {
                        this.updateMiniPlayerIcon();
                    }
                });
            });
        });
    }

    /**
     * Move the given page's <video> element into the floating mini-player,
     * leaving its original spot (now hidden) empty. No-ops if nothing is loaded.
     */
    minimizePlayer(type) {
        const video = type === 'live' ? this.player?.video : this.pages.watch?.video;
        if (!video || !video.currentSrc || video.ended) return;

        // Only one mini-player slot exists - drop the other type first if present
        if (this.miniPlayer.active && this.miniPlayer.type !== type) {
            this.closeMiniPlayer();
        }

        this.miniPlayer = {
            active: true,
            type,
            video,
            originalParent: video.parentNode,
            originalNextSibling: video.nextSibling,
        };

        document.getElementById('mini-player-video-slot').appendChild(video);

        const titleSource = type === 'live'
            ? document.getElementById('player-channel-name')
            : document.getElementById('watch-title');
        document.getElementById('mini-player-title').textContent = titleSource?.textContent || '';

        document.getElementById('mini-player').hidden = false;
        this.updateMiniPlayerIcon();
    }

    /** Move the floating video back to where it came from (its page is visible again). */
    restoreMiniPlayer() {
        const mp = this.miniPlayer;
        if (!mp.active) return;

        if (mp.originalNextSibling) {
            mp.originalParent.insertBefore(mp.video, mp.originalNextSibling);
        } else {
            mp.originalParent.appendChild(mp.video);
        }

        document.getElementById('mini-player').hidden = true;
        this.miniPlayer = { active: false, type: null, video: null, originalParent: null, originalNextSibling: null };
    }

    /** Stop playback and dock the video back home, without navigating to it. */
    closeMiniPlayer() {
        this.miniPlayer.video?.pause();
        this.restoreMiniPlayer();
    }

    updateMiniPlayerIcon() {
        const mp = this.miniPlayer;
        if (!mp.active) return;
        document.getElementById('mini-player').classList.toggle('paused', mp.video.paused);
    }
}

// Start app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();

    // Fetch and display version badge
    fetch('/api/version')
        .then(res => res.json())
        .then(data => {
            const badge = document.getElementById('version-badge');
            if (badge && data.version) badge.textContent = `v${data.version}`;
        })
        .catch(() => { });
});
