import React, { useState } from 'react';
import { MOCK_BOTS } from '../mock-data';
import { TBot, TBotStatus } from '../types';
import BotCard from './bot-card';

type TBotLibraryProps = { onLoadBot: (bot: TBot) => void };

const STATUS_FILTERS: (TBotStatus | 'All')[] = ['All', 'Active', 'Testing', 'Beta'];

const BotLibrary = ({ onLoadBot }: TBotLibraryProps) => {
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<TBotStatus | 'All'>('All');

    const filtered = MOCK_BOTS.filter(bot => {
        const matchSearch =
            bot.name.toLowerCase().includes(search.toLowerCase()) ||
            bot.strategy.toLowerCase().includes(search.toLowerCase()) ||
            bot.market.toLowerCase().includes(search.toLowerCase());
        const matchStatus = statusFilter === 'All' || bot.status === statusFilter;
        return matchSearch && matchStatus;
    });

    return (
        <div className='bi-library'>
            <div className='bi-library__header'>
                <div>
                    <h2 className='bi-library__title'>📚 Bot Library</h2>
                    <p className='bi-library__subtitle'>{filtered.length} bots available — click Load to activate</p>
                </div>

                <div className='bi-library__controls'>
                    <div className='bi-search'>
                        <span className='bi-search__icon'>🔍</span>
                        <input
                            className='bi-search__input'
                            placeholder='Search bots, strategies, markets...'
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>

                    <div className='bi-filter-tabs'>
                        {STATUS_FILTERS.map(f => (
                            <button
                                key={f}
                                className={`bi-filter-tab ${statusFilter === f ? 'bi-filter-tab--active' : ''}`}
                                onClick={() => setStatusFilter(f)}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {filtered.length === 0 ? (
                <div className='bi-empty'>
                    <div className='bi-empty__icon'>🤖</div>
                    <p>No bots match your search.</p>
                </div>
            ) : (
                <div className='bi-library__grid'>
                    {filtered.map(bot => (
                        <BotCard key={bot.id} bot={bot} onLoad={onLoadBot} />
                    ))}
                </div>
            )}
        </div>
    );
};

export default BotLibrary;
