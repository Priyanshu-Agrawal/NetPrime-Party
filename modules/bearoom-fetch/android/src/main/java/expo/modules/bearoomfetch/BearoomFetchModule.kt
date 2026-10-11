package expo.modules.bearoomfetch

import android.util.Base64
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InterruptedIOException
import java.net.InetAddress
import java.security.MessageDigest
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Cookie
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

class FetchRequest : Record {
  @Field val url: String = ""
  @Field val method: String = "GET"
  @Field val headers: Map<String, String> = emptyMap()
  @Field val body: String? = null
  @Field val timeoutMs: Int = 8000
  @Field val maxBytes: Int = 20 * 1024 * 1024
  @Field val responseType: String = "text"
}

/**
 * One HTTP exchange for the plugin host (spec §5.4). No redirects followed (JS walks them hop by hop), no cookie
 * store (each plugin has its own jar in JS), public addresses only: the resolver filters every connection, and
 * IP-literal hosts — which skip DNS — are checked here.
 */
class BearoomFetchModule : Module() {
  private val client: OkHttpClient by lazy {
    OkHttpClient.Builder()
      .followRedirects(false)
      .followSslRedirects(false)
      .dns(PublicOnlyDns)
      .retryOnConnectionFailure(false)
      .build()
  }

  override fun definition() = ModuleDefinition {
    Name("BearoomFetch")

    AsyncFunction("fetchOnce") Coroutine { req: FetchRequest ->
      withContext(Dispatchers.IO) { perform(req) }
    }
  }

  private fun perform(req: FetchRequest): Map<String, Any?> {
    val url = req.url.toHttpUrlOrNull()
      ?: throw CodedException("ERR_BAD_REQUEST", "Not an http(s) URL", null)
    // OkHttp skips the resolver for any host made of digits and dots (or with a ':'), so check those here: a strict
    // dotted quad or IPv6 literal must be public, and any other numeric form ("127.1", "2130706433") is refused.
    if (looksNumeric(url.host)) {
      val addr = if (IPV4.matches(url.host) || url.host.contains(':')) {
        try { InetAddress.getByName(url.host) } catch (e: Exception) { null }
      } else null
      if (addr == null || !isPublicAddress(addr)) {
        throw CodedException("ERR_BLOCKED_ADDRESS", "Blocked non-public address", null)
      }
    }
    val method = req.method.uppercase()
    val contentType = req.headers.entries.firstOrNull { it.key.equals("content-type", ignoreCase = true) }?.value
    val body = if (method == "GET" || method == "HEAD") null else (req.body ?: "").toRequestBody(contentType?.toMediaTypeOrNull())
    val builder = try {
      Request.Builder().url(url).method(method, body)
    } catch (e: IllegalArgumentException) {
      throw CodedException("ERR_BAD_REQUEST", e.message ?: "Bad request", e)
    }
    for ((name, value) in req.headers) {
      try {
        builder.header(name, value)
      } catch (e: IllegalArgumentException) {
        throw CodedException("ERR_BAD_REQUEST", "Bad header $name", e)
      }
    }
    val call = client.newBuilder()
      .callTimeout(req.timeoutMs.toLong(), TimeUnit.MILLISECONDS)
      .build()
      .newCall(builder.build())
    try {
      call.execute().use { res ->
        val digest = MessageDigest.getInstance("SHA-256")
        val out = ByteArrayOutputStream()
        var truncated = false
        res.body?.byteStream()?.use { stream ->
          val buf = ByteArray(16 * 1024)
          while (true) {
            val n = stream.read(buf)
            if (n < 0) break
            val room = req.maxBytes - out.size()
            if (n > room) {
              out.write(buf, 0, room)
              digest.update(buf, 0, room)
              truncated = true
              break
            }
            out.write(buf, 0, n)
            digest.update(buf, 0, n)
          }
        }
        val bytes = out.toByteArray()
        val headers = linkedMapOf<String, String>()
        for (name in res.headers.names()) {
          val lower = name.lowercase()
          if (lower != "set-cookie") headers[lower] = res.headers(name).joinToString(", ")
        }
        val cookies = Cookie.parseAll(url, res.headers).map { c ->
          mapOf(
            "name" to c.name,
            "value" to c.value,
            "domain" to c.domain,
            "path" to c.path,
            "hostOnly" to c.hostOnly,
            "secure" to c.secure,
            "expiresAt" to if (c.persistent) c.expiresAt.toDouble() else 0.0,
          )
        }
        val base64 = req.responseType == "base64"
        val charset = res.body?.contentType()?.charset(Charsets.UTF_8) ?: Charsets.UTF_8
        return mapOf(
          "status" to res.code,
          "url" to res.request.url.toString(),
          "headers" to headers,
          "cookies" to cookies,
          "body" to if (base64) Base64.encodeToString(bytes, Base64.NO_WRAP) else String(bytes, charset),
          "encoding" to if (base64) "base64" else "text",
          "truncated" to truncated,
          "sha256" to digest.digest().joinToString("") { "%02x".format(it) },
        )
      }
    } catch (e: IOException) {
      if (generateSequence<Throwable>(e) { it.cause }.any { it is BlockedAddressException }) {
        throw CodedException("ERR_BLOCKED_ADDRESS", "Blocked non-public address", e)
      }
      if (e is InterruptedIOException) throw CodedException("ERR_TIMEOUT", "Timed out", e)
      throw CodedException("ERR_NETWORK", e.message ?: "Network error", e)
    }
  }

  private fun looksNumeric(host: String) = host.contains(':') || NUMERIC.matches(host)

  private companion object {
    val IPV4 = Regex("^\\d{1,3}(\\.\\d{1,3}){3}$")
    val NUMERIC = Regex("^[\\d.]+$")
  }
}
