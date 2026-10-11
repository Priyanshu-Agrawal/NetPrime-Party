import Darwin
import Foundation

/// Every address a host resolves to must be public (spec §8 SSRF guard). URLSession resolves again when it connects,
/// so a DNS answer that changes in between is not caught here — Android checks at connect time instead.
enum PublicAddress {
  enum Failure: Error { case blocked, unresolved }

  static func check(host: String) throws {
    var hints = addrinfo(
      ai_flags: AI_ADDRCONFIG, ai_family: AF_UNSPEC, ai_socktype: SOCK_STREAM, ai_protocol: 0,
      ai_addrlen: 0, ai_canonname: nil, ai_addr: nil, ai_next: nil)
    var result: UnsafeMutablePointer<addrinfo>?
    guard getaddrinfo(host, nil, &hints, &result) == 0, let first = result else { throw Failure.unresolved }
    defer { freeaddrinfo(result) }
    var node: UnsafeMutablePointer<addrinfo>? = first
    while let ai = node {
      if ai.pointee.ai_family == AF_INET, let sa = ai.pointee.ai_addr {
        let sin = sa.withMemoryRebound(to: sockaddr_in.self, capacity: 1) { $0.pointee }
        let bytes = withUnsafeBytes(of: sin.sin_addr) { Array($0) }
        if !isPublic(v4: bytes) { throw Failure.blocked }
      } else if ai.pointee.ai_family == AF_INET6, let sa = ai.pointee.ai_addr {
        let sin6 = sa.withMemoryRebound(to: sockaddr_in6.self, capacity: 1) { $0.pointee }
        let bytes = withUnsafeBytes(of: sin6.sin6_addr) { Array($0) }
        if !isPublic(v6: bytes) { throw Failure.blocked }
      }
      node = ai.pointee.ai_next
    }
  }

  static func isPublic(v4 b: [UInt8]) -> Bool {
    let a = b[0], c = b[1]
    if a == 0 || a == 10 || a == 127 { return false }
    if a == 100 && (64...127).contains(c) { return false }
    if a == 169 && c == 254 { return false }
    if a == 172 && (16...31).contains(c) { return false }
    if a == 192 && c == 168 { return false }
    if a == 192 && c == 0 && (b[2] == 0 || b[2] == 2) { return false }
    if a == 198 && (c == 18 || c == 19) { return false }
    if a == 198 && c == 51 && b[2] == 100 { return false }
    if a == 203 && c == 0 && b[2] == 113 { return false }
    if a >= 224 { return false }
    return true
  }

  static func isPublic(v6 b: [UInt8]) -> Bool {
    if b[0..<10].allSatisfy({ $0 == 0 }) && b[10] == 0xff && b[11] == 0xff { return isPublic(v4: Array(b[12..<16])) }
    if b[0] == 0x00 && b[1] == 0x64 && b[2] == 0xff && b[3] == 0x9b { return isPublic(v4: Array(b[12..<16])) }
    if b[0] == 0x00 { return false }
    if (b[0] & 0xfe) == 0xfc { return false }
    if b[0] == 0xfe && (b[1] & 0xc0) == 0x80 { return false }
    if b[0] == 0xff { return false }
    if b[0] == 0x20 && b[1] == 0x01 && b[2] == 0x0d && b[3] == 0xb8 { return false }
    return true
  }
}
