import { observer } from 'mobx-react-lite';
import SettingsButton from '@/components/ui/settings-button/SettingsButton';
import { DBOT_TABS } from '@/constants/bot-contents';
import { useStore } from '@/hooks/useStore';
import ChartWrapper from '@/pages/chart/chart-wrapper';
import styles from './up-and-down.module.scss';

const UpAndDown = observer(() => {
    const {
        dashboard: { active_tab },
        ui: { showChartSettingsModal, setShowChartSettingsModal },
    } = useStore();

    const handleSettings = () => {
        setShowChartSettingsModal(!showChartSettingsModal);
    };

    return (
        <div className={styles.page}>
            <div className={styles.top_bar}>
                <SettingsButton
                    onClick={handleSettings}
                    aria-label='Open Settings'
                    className={`${styles.settings_button} ${showChartSettingsModal ? styles.is_active : ''}`}
                />
            </div>

            <div className={styles.chart_stage}>
                <div className={styles.chart_shell}>
                    <ChartWrapper
                        prefix='up-and-down-chart'
                        refresh_token={active_tab === DBOT_TABS.UP_AND_DOWN ? 'active' : 'inactive'}
                        show_digits_stats={false}
                    />
                </div>
            </div>
        </div>
    );
});

export default UpAndDown;
