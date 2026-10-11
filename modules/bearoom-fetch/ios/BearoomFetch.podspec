Pod::Spec.new do |s|
  s.name           = 'BearoomFetch'
  s.version        = '1.0.0'
  s.summary        = 'Bearoom plugin-host fetch (manual redirects, public addresses only)'
  s.description    = 'One HTTP exchange per call for the plugin host, with no shared cookies and no private addresses.'
  s.license        = 'MIT'
  s.author         = 'Bearoom'
  s.homepage       = 'https://github.com/'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
end
