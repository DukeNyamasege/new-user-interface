import { useCallback, useEffect, useMemo, useState } from 'react';
import Dialog from '@/components/shared_ui/dialog';
import './install-app-button.scss';

type TBeforeInstallPromptEvent = Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const INSTALLED_STORAGE_KEY = 'risk_managers_pwa_installed';
const IOS_INSTALL_MESSAGE = 'To install this app on iPhone/iPad, tap Share, then Add to Home Screen.';

const isStandaloneDisplay = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);

const isIOSDevice = () => {
    const userAgent = window.navigator.userAgent.toLowerCase();
    const platform = window.navigator.platform.toLowerCase();

    return /iphone|ipad|ipod/.test(userAgent) || (platform === 'macintel' && window.navigator.maxTouchPoints > 1);
};

const InstallAppButton = () => {
    const [installPrompt, setInstallPrompt] = useState<TBeforeInstallPromptEvent | null>(null);
    const [isInstalled, setIsInstalled] = useState(false);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [showIOSHelp, setShowIOSHelp] = useState(false);

    const isiOS = useMemo(() => {
        if (typeof window === 'undefined') return false;
        return isIOSDevice();
    }, []);

    useEffect(() => {
        const hasInstalledFlag = window.localStorage.getItem(INSTALLED_STORAGE_KEY) === 'true';
        const installed = isStandaloneDisplay() || hasInstalledFlag;

        setIsInstalled(installed);

        if (isiOS && !installed) {
            setIsModalVisible(true);
        }

        const handleBeforeInstallPrompt = (event: Event) => {
            event.preventDefault();
            const promptEvent = event as TBeforeInstallPromptEvent;

            setInstallPrompt(promptEvent);
            setIsModalVisible(true);
        };

        const handleAppInstalled = () => {
            window.localStorage.setItem(INSTALLED_STORAGE_KEY, 'true');
            setInstallPrompt(null);
            setIsInstalled(true);
            setIsModalVisible(false);
            setShowIOSHelp(false);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.addEventListener('appinstalled', handleAppInstalled);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            window.removeEventListener('appinstalled', handleAppInstalled);
        };
    }, [isiOS]);

    const handleInstallClick = useCallback(async () => {
        if (isiOS && !installPrompt) {
            setShowIOSHelp(true);
            return;
        }

        if (!installPrompt) return;

        await installPrompt.prompt();
        const choice = await installPrompt.userChoice;

        setInstallPrompt(null);
        setIsModalVisible(false);

        if (choice.outcome === 'accepted') {
            window.localStorage.setItem(INSTALLED_STORAGE_KEY, 'true');
            setIsInstalled(true);
        }
    }, [installPrompt, isiOS]);

    const handleDeny = useCallback(() => {
        setIsModalVisible(false);
        setShowIOSHelp(false);
    }, []);

    if (isInstalled || (!installPrompt && !isiOS)) return null;

    return (
        <Dialog
            cancel_button_text='Deny'
            className='install-app-modal'
            confirm_button_text={isiOS && showIOSHelp ? 'Done' : 'Accept'}
            dismissable={false}
            is_mobile_full_width={false}
            is_visible={isModalVisible}
            login={() => undefined}
            onCancel={handleDeny}
            onConfirm={isiOS && showIOSHelp ? handleDeny : handleInstallClick}
            portal_element_id='modal_root'
            title='Install Risk managers'
        >
            <div className='install-app-modal__content'>
                <p className='install-app-modal__message'>
                    Install Risk managers on this device for a faster app-like trading experience.
                </p>
                {isiOS && (
                    <p className='install-app-modal__hint'>
                        {showIOSHelp
                            ? IOS_INSTALL_MESSAGE
                            : 'iPhone and iPad installation opens from Safari Share options.'}
                    </p>
                )}
                {!isiOS && (
                    <p className='install-app-modal__hint'>
                        Choose Accept to open your browser install prompt, or Deny to continue in the browser.
                    </p>
                )}
            </div>
        </Dialog>
    );
};

export default InstallAppButton;
