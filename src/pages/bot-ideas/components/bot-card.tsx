import React from 'react';
import { TBot } from '../types';

type TBotCardProps = {
    bot: TBot;
    onLoad: (bot: TBot) => void;
};

const STATUS_CONFIG = {
    Active: { label: 'Active', class: 'bi-badge--active' },
    Testing: { label: 'Testing', class: 'bi-badge--testing' },
    Beta: { label: 'Beta', class: 'bi-badge--beta' },
    Inactive: { label: 'Inactive', class: 'bi-badge--inactive' },
};

const RISK_CONFIG = {
    Low: '🟢 Low',
    Medium: '🟡 Medium',
    High: '🔴 High',
};

const BotCard = ({ bot, onLoad }: TBotCardProps) => {
    const status = STATUS_CONFIG[bot.status];
    const winBarWidth = `${bot.winRate}%`;
    const winColor = bot.winRate >= 70 ? '#00c076' : bot.winRate >= 60 ? '#f0b429' : '#ff444f';

    return (
        <div className='bi-card'>
            <div className='bi-card__header'>
                <div className='bi-card__header-left'>
                    <div className='bi-card__avatar'>{bot.name.charAt(0)}</div>
                    <div>
                        <div className='bi-card__name'>{bot.name}</div>
                        <div className='bi-card__strategy'>{bot.strategy}</div>
                    </div>
                </div>
                <span className={`bi-badge ${status.class}`}>{status.label}</span>
            </div>

            <p className='bi-card__desc'>{bot.description}</p>

            <div className='bi-card__tags'>
                {bot.tags.map(tag => (
                    <span key={tag} className='bi-tag'>
                        {tag}
                    </span>
                ))}
            </div>

            <div className='bi-card__stats'>
                <div className='bi-stat'>
                    <span className='bi-stat__label'>Market</span>
                    <span className='bi-stat__value'>{bot.market}</span>
                </div>
                <div className='bi-stat'>
                    <span className='bi-stat__label'>Risk</span>
                    <span className='bi-stat__value'>{RISK_CONFIG[bot.risk]}</span>
                </div>
                <div className='bi-stat'>
                    <span className='bi-stat__label'>Trades</span>
                    <span className='bi-stat__value'>{bot.trades.toLocaleString()}</span>
                </div>
                <div className='bi-stat'>
                    <span className='bi-stat__label'>Avg Profit</span>
                    <span className='bi-stat__value bi-stat__value--green'>+{bot.profit}%</span>
                </div>
            </div>

            <div className='bi-card__winrate'>
                <div className='bi-card__winrate-label'>
                    <span>Win Rate</span>
                    <span style={{ color: winColor, fontWeight: 700 }}>{bot.winRate}%</span>
                </div>
                <div className='bi-winbar'>
                    <div className='bi-winbar__fill' style={{ width: winBarWidth, backgroundColor: winColor }} />
                </div>
            </div>

            <div className='bi-card__rating'>
                {'★'.repeat(Math.round(bot.rating))}
                {'☆'.repeat(5 - Math.round(bot.rating))}
                <span className='bi-card__rating-value'>{bot.rating}</span>
            </div>

            <div className='bi-card__actions'>
                <button className='bi-btn bi-btn--primary' onClick={() => onLoad(bot)}>
                    ▶ Load Bot
                </button>
                <button className='bi-btn bi-btn--ghost'>📊 View Stats</button>
            </div>
        </div>
    );
};

export default BotCard;
