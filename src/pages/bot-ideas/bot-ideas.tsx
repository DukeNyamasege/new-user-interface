import { useState } from 'react';
import BotLibrary from './components/bot-library';
import BotLoader from './components/bot-loader';
import SubmitForm from './components/submit-form';
import { TBot, TBotIdeasView } from './types';
import './bot-ideas.scss';

type TNavItem = { view: TBotIdeasView; label: string; icon: string };

const NAV_ITEMS: TNavItem[] = [
    { view: 'library', label: 'Bot Library', icon: '📚' },
    { view: 'submit', label: 'Submit Idea', icon: '💡' },
    { view: 'my-bots', label: 'My Bots', icon: '🗂' },
];

const MyBots = () => (
    <div className='bi-empty bi-empty--center'>
        <div className='bi-empty__icon'>🤖</div>
        <h3>No bots loaded yet</h3>
        <p>
            Go to the Bot Library and click <strong>Load Bot</strong> to activate a strategy.
        </p>
    </div>
);

const BotIdeas = () => {
    const [view, setView] = useState<TBotIdeasView>('library');
    const [activeBot, setActiveBot] = useState<TBot | null>(null);

    const handleLoadBot = (bot: TBot) => {
        setActiveBot(bot);
        setView('loader');
    };

    const handleNavClick = (v: TBotIdeasView) => {
        setView(v);
        if (v !== 'loader') setActiveBot(null);
    };

    return (
        <div className='bot-ideas'>
            {/* ── Sidebar ── */}
            <aside className='bi-sidebar'>
                <div className='bi-sidebar__brand'>
                    <span className='bi-sidebar__brand-icon'>🔥</span>
                    <div>
                        <div className='bi-sidebar__brand-name'>Bot Ideas</div>
                        <div className='bi-sidebar__brand-sub'>Trading Control Centre</div>
                    </div>
                </div>

                <nav className='bi-sidebar__nav'>
                    {NAV_ITEMS.map(item => (
                        <button
                            key={item.view}
                            className={`bi-nav-item ${view === item.view ? 'bi-nav-item--active' : ''}`}
                            onClick={() => handleNavClick(item.view)}
                        >
                            <span className='bi-nav-item__icon'>{item.icon}</span>
                            <span className='bi-nav-item__label'>{item.label}</span>
                        </button>
                    ))}
                </nav>

                <div className='bi-sidebar__footer'>
                    <div className='bi-sidebar__footer-label'>Platform Status</div>
                    <div className='bi-sidebar__footer-status'>
                        <span className='bi-dot bi-dot--live' />
                        <span>Systems Operational</span>
                    </div>
                    <div className='bi-sidebar__footer-stat'>
                        <span>Total Bots</span>
                        <strong>6</strong>
                    </div>
                    <div className='bi-sidebar__footer-stat'>
                        <span>Active</span>
                        <strong className='bi-green'>3</strong>
                    </div>
                </div>
            </aside>

            {/* ── Main Content ── */}
            <main className='bi-main'>
                {view === 'library' && <BotLibrary onLoadBot={handleLoadBot} />}
                {view === 'submit' && <SubmitForm />}
                {view === 'my-bots' && <MyBots />}
                {view === 'loader' && activeBot && <BotLoader bot={activeBot} onBack={() => setView('library')} />}
            </main>
        </div>
    );
};

export default BotIdeas;
