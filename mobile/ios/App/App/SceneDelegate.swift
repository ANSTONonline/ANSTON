import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = CAPBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)

        // Opened by tapping a myanston.com link: show that page instead of the home page.
        openAnstonLink(connectionOptions.userActivities.first?.webpageURL)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)

        // A myanston.com link was tapped while the app was already open.
        if userActivity.activityType == NSUserActivityTypeBrowsingWeb {
            openAnstonLink(userActivity.webpageURL)
        }
    }

    private func openAnstonLink(_ url: URL?) {
        guard let url = url, url.scheme == "https",
              let host = url.host, host == "myanston.com" || host == "www.myanston.com" else { return }
        DispatchQueue.main.async { [weak self] in
            (self?.window?.rootViewController as? CAPBridgeViewController)?.webView?.load(URLRequest(url: url))
        }
    }
}
