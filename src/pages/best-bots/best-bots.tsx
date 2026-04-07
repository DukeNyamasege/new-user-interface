import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { DBOT_TABS } from '@/constants/bot-contents';
import { load, save_types } from '@/external/bot-skeleton';
import { useStore } from '@/hooks/useStore';
import './best-bots.scss';

type TBot = {
    id: string;
    name: string;
    file: string;
    description: string;
    emoji: string;
};

// Ordered: D1 → D6 first, then the rest
const BOTS: TBot[] = [
    {
        id: 'd1',
        name: 'D1-BY MR.DUKE',
        file: 'D1-BY MR.DUKE(+254702490526).xml',
        description: 'Classic Deriv bot with consistent, reliable performance across markets.',
        emoji: '🔵',
    },
    {
        id: 'd2',
        name: 'D2 BY--MR.DUKE',
        file: 'D2 BY--MR.DUKE(+254702490526) (1).xml',
        description: 'Enhanced second-generation strategy with improved entry signals.',
        emoji: '⚡',
    },
    {
        id: 'd3',
        name: 'The-D3 rise and fall',
        file: 'The-D3 rise and fall.xml',
        description: 'Trend-following strategy targeting rise and fall market patterns.',
        emoji: '📊',
    },
    {
        id: 'd4',
        name: 'D4 Update by MR.DUKE FINAL',
        file: 'D4 Update by MR.DUKE(+254702490526)FINAL  (%%%)) (1) (1) (1).xml',
        description: 'Final polished version of the D-series with multi-market support.',
        emoji: '🏆',
    },
    {
        id: 'd5',
        name: 'D5 (Original version)',
        file: 'D5 (Original version +254702490526).xml',
        description: 'The original flagship D5 strategy — time-tested and dependable.',
        emoji: '⭐',
    },
    {
        id: 'd6',
        name: 'D6 Deriv by Duke',
        file: 'D6 Deriv by Duke (1).xml',
        description: 'Deriv-optimised strategy with refined logic for smoother execution.',
        emoji: '🎯',
    },
    {
        id: 'black-devil',
        name: 'BLACK DEVIL v2',
        file: 'BLACK DEVIL v2( By MR. DUKE).xml',
        description: 'Aggressive scalping strategy with precision entries and tight risk control.',
        emoji: '😈',
    },
    {
        id: 'grffy',
        name: 'grffy',
        file: 'grffy.xml',
        description: 'Volatility-driven strategy with adaptive position sizing.',
        emoji: '🔲',
    },
    {
        id: 'kiazala',
        name: 'Kiazala v1 by The Risk Manager',
        file: 'Kiazala v1 by The Risk Manager (1).xml',
        description: 'Disciplined risk-managed bot designed to protect capital while growing.',
        emoji: '🛡️',
    },
    {
        id: 'kumi',
        name: 'KUMI NA NNE BORA V2',
        file: 'KUMI NA NNE BORA V2  (1) (1).xml',
        description: 'Multi-step accumulation strategy with layered entry logic.',
        emoji: '📈',
    },
    {
        id: 'mwenda',
        name: 'Mwenda Pole By The Risk Manager',
        file: 'Mwenda Pole By The Risk Manager (1).xml',
        description: 'Slow and steady conservative approach — ideal for low-risk accounts.',
        emoji: '🐢',
    },
    {
        id: 'simba',
        name: 'Simba Ai v1',
        file: 'Simba Ai v1.xml',
        description: 'AI-enhanced strategy combining pattern recognition with smart exits.',
        emoji: '🦁',
    },
    {
        id: 'speedhack',
        name: 'Speedhack by mrduke.site 00',
        file: 'Speedhack by mrduke.site 00 (1).xml',
        description: 'Ultra-fast tick-based execution for volatile market conditions.',
        emoji: '🚀',
    },
    {
        id: 'under789',
        name: 'under 7,8,9= g2 bot 1==',
        file: 'under 7,8,9= g2 bot 1==.xml',
        description: 'Specialised over/under boundary strategy for digit markets.',
        emoji: '🎲',
    },
    {
        id: 'wealth',
        name: 'Wealth Generator',
        file: 'Wealth Generator.xml',
        description: 'Compound growth strategy built for long-term account building.',
        emoji: '💰',
    },
];

const BotCard = observer(({ bot }: { bot: TBot }) => {
    const { dashboard } = useStore();
    const { setActiveTab } = dashboard;
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState(false);

    const handleLoad = async () => {
        setLoading(true);
        setError(false);
        try {
            const url = `/bots/${encodeURIComponent(bot.file)}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const xml_text = await res.text();
            const workspace = window.Blockly?.derivWorkspace;
            if (!workspace) throw new Error('Workspace not ready');
            await load({
                block_string: xml_text,
                file_name: bot.name,
                workspace,
                from: save_types.LOCAL,
                drop_event: {},
                strategy_id: null,
                showIncompatibleStrategyDialog: false,
            });
            setLoaded(true);
            setTimeout(() => setLoaded(false), 3000);
            setActiveTab(DBOT_TABS.BOT_BUILDER);
        } catch {
            setError(true);
            setTimeout(() => setError(false), 4000);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className='bb-card'>
            <span className='bb-card__emoji'>{bot.emoji}</span>
            <h3 className='bb-card__name'>{bot.name}</h3>
            <p className='bb-card__desc'>{bot.description}</p>
            <button
                className={`bb-card__btn${loaded ? ' bb-card__btn--loaded' : ''}${error ? ' bb-card__btn--error' : ''}`}
                onClick={handleLoad}
                disabled={loading}
            >
                {loading ? 'Loading…' : loaded ? '✓ Loaded to Builder' : error ? '✗ Failed — retry' : 'Load Bot'}
            </button>
        </div>
    );
});

const BestBots = () => (
    <div className='best-bots'>
        <div className='best-bots__grid'>
            {BOTS.map(bot => (
                <BotCard key={bot.id} bot={bot} />
            ))}
        </div>
    </div>
);

export default BestBots;
