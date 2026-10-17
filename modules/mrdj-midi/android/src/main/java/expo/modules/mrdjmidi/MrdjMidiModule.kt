package expo.modules.mrdjmidi

import android.content.Context
import android.content.pm.PackageManager
import android.media.midi.MidiDevice
import android.media.midi.MidiDeviceInfo
import android.media.midi.MidiManager
import android.media.midi.MidiOutputPort
import android.media.midi.MidiReceiver
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * MIDI input for Android (USB class-compliant controllers, and Bluetooth MIDI
 * devices once connected by the system). Every output port of every device
 * is opened and its raw bytes are forwarded to JS.
 */
class MrdjMidiModule : Module() {
  private val handler = Handler(Looper.getMainLooper())
  private var manager: MidiManager? = null
  private val devices = mutableMapOf<Int, MidiDevice>()
  private val ports = mutableMapOf<Int, MutableList<MidiOutputPort>>()

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val callback = object : MidiManager.DeviceCallback() {
    override fun onDeviceAdded(info: MidiDeviceInfo) {
      open(info)
      notifyDevices()
    }

    override fun onDeviceRemoved(info: MidiDeviceInfo) {
      close(info.id)
      notifyDevices()
    }
  }

  override fun definition() = ModuleDefinition {
    Name("MrdjMidi")
    Events("onMessage", "onDevicesChanged")

    Function("isSupported") {
      context.packageManager.hasSystemFeature(PackageManager.FEATURE_MIDI)
    }

    Function("start") {
      start()
      deviceNames()
    }

    Function("getDevices") {
      deviceNames()
    }

    AsyncFunction("showBluetoothPairing") {
      // Android pairs BLE MIDI from the system / vendor apps; nothing to show here.
    }

    OnDestroy {
      manager?.unregisterDeviceCallback(callback)
      devices.keys.toList().forEach { close(it) }
    }
  }

  @Suppress("DEPRECATION")
  private fun start() {
    if (manager != null) return
    if (!context.packageManager.hasSystemFeature(PackageManager.FEATURE_MIDI)) return
    val m = context.getSystemService(Context.MIDI_SERVICE) as? MidiManager ?: return
    manager = m
    m.registerDeviceCallback(callback, handler)
    m.devices.forEach { open(it) }
  }

  private fun nameOf(info: MidiDeviceInfo): String =
    info.properties.getString(MidiDeviceInfo.PROPERTY_NAME)
      ?: info.properties.getString(MidiDeviceInfo.PROPERTY_PRODUCT)
      ?: "MIDI"

  private fun open(info: MidiDeviceInfo) {
    val m = manager ?: return
    if (info.outputPortCount == 0 || devices.containsKey(info.id)) return
    val name = nameOf(info)
    m.openDevice(info, { device ->
      if (device == null) return@openDevice
      devices[info.id] = device
      val list = mutableListOf<MidiOutputPort>()
      for (i in 0 until info.outputPortCount) {
        val port = device.openOutputPort(i) ?: continue
        port.connect(object : MidiReceiver() {
          override fun onSend(msg: ByteArray, offset: Int, count: Int, timestamp: Long) {
            val data = ArrayList<Int>(count)
            for (k in offset until offset + count) data.add(msg[k].toInt() and 0xff)
            sendEvent("onMessage", mapOf("data" to data, "device" to name))
          }
        })
        list.add(port)
      }
      ports[info.id] = list
    }, handler)
  }

  private fun close(id: Int) {
    ports.remove(id)?.forEach { runCatching { it.close() } }
    devices.remove(id)?.let { runCatching { it.close() } }
  }

  @Suppress("DEPRECATION")
  private fun deviceNames(): List<String> =
    manager?.devices?.filter { it.outputPortCount > 0 }?.map { nameOf(it) } ?: emptyList()

  private fun notifyDevices() {
    sendEvent("onDevicesChanged", mapOf("devices" to deviceNames()))
  }
}
