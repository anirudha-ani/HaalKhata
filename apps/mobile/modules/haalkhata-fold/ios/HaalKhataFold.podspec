# Where a foldable display folds: the app's own Expo module, linked from apps/mobile/modules.
Pod::Spec.new do |s|
  s.name           = 'HaalKhataFold'
  s.version        = '1.0.0'
  s.summary        = 'Reports where the window is divided by a fold.'
  s.description    = 'Reports the window region a foldable display folds across, so dialogs can keep off the crease.'
  s.author         = 'HaalKhata'
  s.homepage       = 'https://haalkhata.app'
  s.license        = { :type => 'Proprietary' }
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
