import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import Text from '@/components/shared_ui/text';
import { DBOT_TABS } from '@/constants/bot-contents';
import { useStore } from '@/hooks/useStore';
import { StandaloneComputerFillIcon } from '@deriv/quill-icons/Standalone';
import { Localize } from '@deriv-com/translations';
import DashboardBotList from './bot-list/dashboard-bot-list';

type TCardProps = {
    has_dashboard_strategies: boolean;
    is_mobile: boolean;
};

const Cards = observer(({ is_mobile, has_dashboard_strategies }: TCardProps) => {
    const { dashboard, load_modal } = useStore();
    const { toggleLoadModal, setActiveTabIndex } = load_modal;
    const { setActiveTab } = dashboard;

    const openFileLoader = () => {
        toggleLoadModal();
        setActiveTabIndex(is_mobile ? 0 : 1);
        setActiveTab(DBOT_TABS.BOT_BUILDER);
    };

    return React.useMemo(
        () => (
            <div
                className={classNames('tab__dashboard__table', {
                    'tab__dashboard__table--minimized': has_dashboard_strategies && is_mobile,
                })}
            >
                <div
                    className={classNames('tab__dashboard__table__tiles', {
                        'tab__dashboard__table__tiles--minimized': has_dashboard_strategies && is_mobile,
                    })}
                    id='tab__dashboard__table__tiles'
                >
                    <div
                        className={classNames('tab__dashboard__table__block', {
                            'tab__dashboard__table__block--minimized': has_dashboard_strategies && is_mobile,
                        })}
                    >
                        <div
                            className={classNames('tab__dashboard__table__images', {
                                'tab__dashboard__table__images--minimized': has_dashboard_strategies,
                            })}
                            id='my-computer'
                            onClick={openFileLoader}
                        >
                            <StandaloneComputerFillIcon iconSize='2xl' className='tab__dashboard__computer-icon' />
                        </div>
                        <Text color='prominent' size={is_mobile ? 'xxs' : 'xs'}>
                            <Localize i18n_default_text='My computer' />
                        </Text>
                    </div>
                </div>
                <DashboardBotList />
            </div>
        ),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [has_dashboard_strategies]
    );
});

export default Cards;
