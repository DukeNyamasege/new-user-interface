import { useCallback, useState } from 'react';
import BotPitchForm from './components/submit-form';
import { TBotIdea } from './types';
import './bot-ideas.scss';

const STORAGE_KEY = 'bot_pitch_ideas';

const loadIdeas = (): TBotIdea[] => {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    } catch {
        return [];
    }
};

const formatDate = (iso: string) => {
    try {
        return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
        return iso;
    }
};

const BotIdeas = () => {
    const [ideas, setIdeas] = useState<TBotIdea[]>(loadIdeas);

    const handleIdeaSubmitted = useCallback((idea: TBotIdea) => {
        setIdeas(prev => [idea, ...prev]);
    }, []);

    return (
        <div className='bot-ideas-page'>
            <div className='bot-ideas-page__inner'>
                <BotPitchForm onIdeaSubmitted={handleIdeaSubmitted} />

                {ideas.length > 0 && (
                    <section className='bi-ideas-list'>
                        <h3 className='bi-ideas-list__heading'>Pitched Ideas</h3>
                        <div className='bi-ideas-list__grid'>
                            {ideas.map(idea => (
                                <div key={idea.id} className='bi-idea-card'>
                                    <div className='bi-idea-card__header'>
                                        <span className='bi-idea-card__name'>{idea.bot_name}</span>
                                        <span className='bi-idea-card__date'>{formatDate(idea.submitted_at)}</span>
                                    </div>
                                    <p className='bi-idea-card__desc'>{idea.strategy_description}</p>
                                </div>
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
};

export default BotIdeas;
