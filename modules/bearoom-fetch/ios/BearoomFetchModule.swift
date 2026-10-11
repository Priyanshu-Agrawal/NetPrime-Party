import CryptoKit
import ExpoModulesCore
import Foundation

struct FetchRequest: Record {
  @Field var url: String = ""
  @Field var method: String = "GET"
  @Field var headers: [String: String] = [:]
  @Field var body: String? = nil
  @Field var timeoutMs: Int = 8000
  @Field var maxBytes: Int = 20 * 1024 * 1024
  @Field var responseType: String = "text"
}

private final class NoRedirects: NSObject, URLSessionTaskDelegate {
  func urlSession(
    _ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void
  ) {
    completionHandler(nil)
  }
}

/// One HTTP exchange for the plugin host (spec §5.4): no redirects followed, no cookie store, public addresses only.
public class BearoomFetchModule: Module {
  private lazy var session: URLSession = {
    let cfg = URLSessionConfiguration.ephemeral
    cfg.httpCookieStorage = nil
    cfg.httpShouldSetCookies = false
    cfg.httpCookieAcceptPolicy = .never
    cfg.urlCache = nil
    cfg.requestCachePolicy = .reloadIgnoringLocalCacheData
    cfg.timeoutIntervalForResource = 30 // backstop; each request's own deadline is enforced below
    return URLSession(configuration: cfg, delegate: NoRedirects(), delegateQueue: nil)
  }()

  public func definition() -> ModuleDefinition {
    Name("BearoomFetch")

    AsyncFunction("fetchOnce") { (req: FetchRequest) async throws -> [String: Any] in
      try await self.perform(req)
    }
  }

  private func fail(_ code: String, _ detail: String) -> Exception {
    Exception(name: "BearoomFetchError", description: detail, code: code)
  }

  private func perform(_ req: FetchRequest) async throws -> [String: Any] {
    guard let url = URL(string: req.url), let scheme = url.scheme?.lowercased(),
      scheme == "http" || scheme == "https", let host = url.host, !host.isEmpty
    else { throw fail("ERR_BAD_REQUEST", "Not an http(s) URL") }
    do {
      // getaddrinfo blocks: run it on a utility queue, never on Swift's shared cooperative pool.
      try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
        DispatchQueue.global(qos: .utility).async {
          do {
            try PublicAddress.check(host: host)
            cont.resume()
          } catch {
            cont.resume(throwing: error)
          }
        }
      }
    } catch PublicAddress.Failure.blocked {
      throw fail("ERR_BLOCKED_ADDRESS", "Blocked non-public address")
    } catch {
      throw fail("ERR_NETWORK", "Could not resolve \(host)")
    }

    var request = URLRequest(url: url, timeoutInterval: Double(req.timeoutMs) / 1000)
    request.httpMethod = req.method.uppercased()
    request.httpShouldHandleCookies = false
    for (name, value) in req.headers { request.setValue(value, forHTTPHeaderField: name) }
    if let body = req.body, request.httpMethod != "GET", request.httpMethod != "HEAD" {
      request.httpBody = body.data(using: .utf8)
    }

    // The whole exchange gets timeoutMs: a server that drips a byte at a time is cut off on time.
    let work = Task { try await self.exchange(request, req) }
    let deadline = Task {
      do {
        try await Task.sleep(nanoseconds: UInt64(max(req.timeoutMs, 1)) * 1_000_000)
        work.cancel()
      } catch {
        // The exchange finished first and cancelled this timer.
      }
    }
    defer { deadline.cancel() }
    do {
      return try await work.value
    } catch is CancellationError {
      throw fail("ERR_TIMEOUT", "Timed out")
    } catch let e as URLError {
      throw fail(e.code == .timedOut || e.code == .cancelled ? "ERR_TIMEOUT" : "ERR_NETWORK", e.localizedDescription)
    }
  }

  private func exchange(_ request: URLRequest, _ req: FetchRequest) async throws -> [String: Any] {
    guard let url = request.url else { throw fail("ERR_BAD_REQUEST", "No URL") }
    let (bytes, response) = try await session.bytes(for: request)
    guard let http = response as? HTTPURLResponse else { throw fail("ERR_NETWORK", "Not an HTTP response") }

    var data = Data()
    var truncated = false
    do {
      for try await byte in bytes {
        if data.count >= req.maxBytes { truncated = true; break }
        data.append(byte)
        if data.count % 65536 == 0 { try Task.checkCancellation() }
      }
    } catch {
      bytes.task.cancel()
      throw error
    }
    if truncated { bytes.task.cancel() }

    var headers: [String: String] = [:]
    var fields: [String: String] = [:]
    for (k, v) in http.allHeaderFields {
      guard let name = k as? String, let value = v as? String else { continue }
      fields[name] = value
      let lower = name.lowercased()
      if lower != "set-cookie" { headers[lower] = value }
    }
    let cookies: [[String: Any]] = HTTPCookie.cookies(withResponseHeaderFields: fields, for: url).map { c in
      let dotted = c.domain.hasPrefix(".")
      return [
        "name": c.name,
        "value": c.value,
        "domain": (dotted ? String(c.domain.dropFirst()) : c.domain).lowercased(),
        "path": c.path,
        "hostOnly": !dotted,
        "secure": c.isSecure,
        "expiresAt": (c.expiresDate?.timeIntervalSince1970 ?? 0) * 1000,
      ]
    }
    let base64 = req.responseType == "base64"
    let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    return [
      "status": http.statusCode,
      "url": http.url?.absoluteString ?? req.url,
      "headers": headers,
      "cookies": cookies,
      "body": base64 ? data.base64EncodedString() : String(decoding: data, as: UTF8.self),
      "encoding": base64 ? "base64" : "text",
      "truncated": truncated,
      "sha256": digest,
    ]
  }
}
