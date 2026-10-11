package expo.modules.bearoomfetch

import java.io.IOException
import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress
import okhttp3.Dns

/** Only globally routable unicast addresses: no loopback, private, link-local, CGNAT, multicast or reserved ranges. */
internal fun isPublicAddress(addr: InetAddress): Boolean {
  if (addr.isAnyLocalAddress || addr.isLoopbackAddress || addr.isLinkLocalAddress ||
    addr.isSiteLocalAddress || addr.isMulticastAddress
  ) return false
  val b = addr.address.map { it.toInt() and 0xff }
  return when (addr) {
    is Inet4Address -> isPublicV4(b)
    is Inet6Address -> isPublicV6(b)
    else -> false
  }
}

private fun isPublicV4(b: List<Int>): Boolean {
  val a = b[0]
  val c = b[1]
  return when {
    a == 0 || a == 10 || a == 127 -> false
    a == 100 && c in 64..127 -> false // CGNAT
    a == 169 && c == 254 -> false
    a == 172 && c in 16..31 -> false
    a == 192 && c == 168 -> false
    a == 192 && c == 0 && (b[2] == 0 || b[2] == 2) -> false
    a == 198 && (c == 18 || c == 19) -> false
    a == 198 && c == 51 && b[2] == 100 -> false
    a == 203 && c == 0 && b[2] == 113 -> false
    a >= 224 -> false // multicast, reserved, broadcast
    else -> true
  }
}

private fun isPublicV6(b: List<Int>): Boolean {
  // IPv4-mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::a.b.c.d — what IPv6-only carriers synthesise) carry a v4 address.
  if (b.subList(0, 10).all { it == 0 } && b[10] == 0xff && b[11] == 0xff) return isPublicV4(b.subList(12, 16))
  if (b[0] == 0x00 && b[1] == 0x64 && b[2] == 0xff && b[3] == 0x9b) return isPublicV4(b.subList(12, 16))
  return when {
    b[0] == 0x00 -> false // ::/8 (::, ::1, v4-compatible)
    (b[0] and 0xfe) == 0xfc -> false // fc00::/7 unique local
    b[0] == 0xfe && (b[1] and 0xc0) == 0x80 -> false // fe80::/10
    b[0] == 0xff -> false // multicast
    b[0] == 0x20 && b[1] == 0x01 && b[2] == 0x0d && b[3] == 0xb8 -> false // documentation
    else -> true
  }
}

internal class BlockedAddressException(host: String) : IOException("Blocked non-public address for $host")

/** OkHttp resolves through this on every connection — so on every redirect hop the JS layer walks. */
internal object PublicOnlyDns : Dns {
  override fun lookup(hostname: String): List<InetAddress> {
    val ok = Dns.SYSTEM.lookup(hostname).filter(::isPublicAddress)
    if (ok.isEmpty()) throw BlockedAddressException(hostname)
    return ok
  }
}
