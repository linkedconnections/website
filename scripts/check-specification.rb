#!/usr/bin/env ruby
require 'json'
require 'cgi'
require 'uri'

build = File.expand_path(ARGV.fetch(0, '_site'))
source = File.expand_path('..', __dir__)
schemas = JSON.parse(File.read(File.join(source, 'specification/schemas.json')))
text = File.read(File.join(build, 'specification/2-0-alpha.html'))
raise 'Unrendered Liquid' if text.include?('{{') || text.include?('{%')
schemas.each do |name, columns|
  table = text.match(/<p>Schema key: <code[^>]*>#{Regexp.escape(name)}<\/code>\.<\/p>\s*<table>(.*?)<\/table>/m)&.captures&.first
  raise "Missing rendered table for #{name}" unless table
  actual = table.scan(/<tr>(.*?)<\/tr>/m).filter_map do |row|
    cells = row.first.scan(/<td>(.*?)<\/td>/m).map { |cell| CGI.unescapeHTML(cell.first.gsub(/<[^>]*>/, '')).strip }
    cells unless cells.empty?
  end
  expected = columns.map { |column| [column['name'], column['type'], column['nullable'] ? 'yes' : 'no'] }
  raise "Schema mismatch: #{name}" unless actual == expected
end

%w[specification/index.html specification/2-0-alpha.html specification/1-0.html].each do |page|
  raise "Missing page: #{page}" unless File.file?(File.join(build, page))
end
%w[specification/index.html specification/2-0-alpha.html].each do |page|
  html = File.read(File.join(build, page))
  html.scan(/href="([^"]+)"/).flatten.each do |href|
    next unless href.start_with?('/', '#') && !href.start_with?('//')
    path, fragment = href.split('#', 2)
    target = if path.empty?
      File.join(build, page)
    else
      relative = path.sub(%r{^/}, '')
      [relative, "#{relative}.html", File.join(relative, 'index.html')].map { |candidate| File.join(build, candidate) }.find { |candidate| File.file?(candidate) }
    end
    raise "Broken local link in #{page}: #{href}" unless target
    if fragment && !fragment.empty?
      raise "Missing fragment #{href}" unless File.read(target).include?("id=\"#{fragment}\"")
    end
  end
end
context_path = File.join(build, 'specification/2-0-alpha/context.jsonld')
raise 'Missing JSON-LD context' unless File.file?(context_path)
context = JSON.parse(File.read(context_path))['@context']
manifest = JSON.parse(File.read(File.join(build, 'specification/examples/manifest.jsonld')))
raise 'Invalid illustrative manifest' unless manifest['@type'] == 'Timetable' && manifest['schemaVersion'] == '2-alpha'
raise 'Manifest does not use the published context' unless manifest['@context'] == 'https://linkedconnections.org/specification/2-0-alpha/context.jsonld'
vocabulary = File.read(File.join(build, 'specification/2-0-alpha/vocabulary.ttl'))
missing = context.values.map { |v| v.is_a?(Hash) ? v['@id'] : v }.grep(/\Alc:/).reject { |term| vocabulary.match?(/^#{Regexp.escape(term)}\s/) }
raise "Context terms not defined in the vocabulary: #{missing.join(', ')}" unless missing.empty?
undefined = []
walk = lambda do |node|
  case node
  when Hash
    node.each do |key, value|
      undefined << key unless key.start_with?('@') || context.key?(key)
      walk.call(value)
    end
  when Array then node.each { |value| walk.call(value) }
  end
end
walk.call(manifest.reject { |key, _| key == '@context' })
raise "Manifest terms missing from the context: #{undefined.uniq.join(', ')}" unless undefined.empty?
puts "Verified version routes, local links, illustrative manifest, JSON-LD context, vocabulary and #{schemas.length} rendered ordered schemas."
