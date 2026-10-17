import CoreAudioKit
import CoreMIDI
import ExpoModulesCore

/// MIDI input for iPhone / iPad: USB (Camera Connection Kit), network sessions
/// and Bluetooth LE MIDI. Every source is connected to a single input port and
/// raw bytes are forwarded to JS, where the MIDI-learn mapping lives.
public final class MrdjMidiModule: Module {
  private var client = MIDIClientRef()
  private var inputPort = MIDIPortRef()
  private var started = false
  private var connected = Set<MIDIEndpointRef>()

  public func definition() -> ModuleDefinition {
    Name("MrdjMidi")
    Events("onMessage", "onDevicesChanged")

    Function("isSupported") { true }

    Function("start") { () -> [String] in
      self.startIfNeeded()
      return self.deviceNames()
    }

    Function("getDevices") { () -> [String] in
      self.deviceNames()
    }

    AsyncFunction("showBluetoothPairing") { () in
      guard let presenter = self.appContext?.utilities?.currentViewController() else { return }
      let central = CABTMIDICentralViewController()
      central.navigationItem.rightBarButtonItem = UIBarButtonItem(
        barButtonSystemItem: .done, target: presenter, action: #selector(UIViewController.dismissModal))
      let nav = UINavigationController(rootViewController: central)
      nav.modalPresentationStyle = .formSheet
      presenter.present(nav, animated: true)
    }.runOnQueue(.main)

    OnDestroy {
      if self.started {
        MIDIPortDispose(self.inputPort)
        MIDIClientDispose(self.client)
      }
    }
  }

  private func startIfNeeded() {
    if started { return }
    started = true
    MIDIClientCreateWithBlock("MrDj" as CFString, &client) { [weak self] notification in
      if notification.pointee.messageID == .msgSetupChanged {
        DispatchQueue.main.async {
          guard let self = self else { return }
          self.connectSources()
          self.sendEvent("onDevicesChanged", ["devices": self.deviceNames()])
        }
      }
    }
    MIDIInputPortCreateWithBlock(client, "MrDj In" as CFString, &inputPort) { [weak self] packetList, srcConnRefCon in
      guard let self = self else { return }
      let name = srcConnRefCon.map { Self.name(of: MIDIEndpointRef(UInt(bitPattern: $0))) } ?? "MIDI"
      for packet in packetList.unsafeSequence() {
        let length = Int(packet.pointee.length)
        if length == 0 { continue }
        let bytes: [Int] = withUnsafeBytes(of: packet.pointee.data) { raw in
          raw.prefix(length).map { Int($0) }
        }
        self.sendEvent("onMessage", ["data": bytes, "device": name])
      }
    }
    connectSources()
  }

  private func connectSources() {
    let count = MIDIGetNumberOfSources()
    for i in 0..<count {
      let src = MIDIGetSource(i)
      if src == 0 || connected.contains(src) { continue }
      let refCon = UnsafeMutableRawPointer(bitPattern: UInt(src))
      if MIDIPortConnectSource(inputPort, src, refCon) == noErr {
        connected.insert(src)
      }
    }
  }

  private func deviceNames() -> [String] {
    (0..<MIDIGetNumberOfSources()).map { Self.name(of: MIDIGetSource($0)) }
  }

  private static func name(of endpoint: MIDIEndpointRef) -> String {
    var cfName: Unmanaged<CFString>?
    if MIDIObjectGetStringProperty(endpoint, kMIDIPropertyDisplayName, &cfName) == noErr, let n = cfName {
      return n.takeRetainedValue() as String
    }
    return "MIDI"
  }
}

private extension UIViewController {
  @objc func dismissModal() {
    presentedViewController?.dismiss(animated: true)
  }
}
