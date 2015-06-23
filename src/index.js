import 'babel/polyfill';
import fs from 'fs';
import path from 'path';

import getLicences from './get-licences';
import format from './format';

/**
 * @param {Object} options options
 * @param {boolean} options.devDependencies
 * @param {Array|RegExp} options.exclude
 * @param {string} options.directory
 */
export default class LicenseChecker {
  constructor(options) {
    this.options = options;

    const exclude = this.options.exclude;
    this.excludes = Array.isArray(exclude) ? exclude : [exclude]
  }

  // TODO Exclude ProvidePlugin requests and aliases
  // See compiler.options.plugins["0"].definitions
  static filterReasons(reason) {
    return typeof reason.userRequest === 'string' && reason.userRequest.match(/^[^!.\/$][^!?=]*$/);
  }

  filterModules(module) {
    return (module.built || module.name.indexOf('external ') === 0) &&
      module.name.indexOf('(webpack)') === -1 &&
      module.reasons.length > 0 && !this.excludes.some(it => it.test(module.name))
  }

  apply(compiler) {
    const directory = this.options.directory;
    const modules = this.options.modules;
    const filename = this.options.filename || 'licenses.xml';
    const title = this.options.title || 'Licenses';

    const production = !this.options.devDependencies;
    const formatModules = this.options.format || format;
    const filterModules = this.filterModules.bind(this);

    compiler.plugin('emit', function (curCompiler, callback) {
      // FS aliases from webpack.
      const mkdirp = compiler.outputFileSystem.mkdirp;
      const writeFile = compiler.outputFileSystem.writeFile;

      const stats = curCompiler.getStats().toJson({
        assets: false,
        chunks: false,
        source: false
      });

      const modules = stats.modules.
        filter(filterModules).
        reduce((collected, module) => collected.concat(
          module.reasons.
            filter(LicenseChecker.filterReasons).
            map(reason => reason.userRequest.split('/')[0])
        ), modules || []);

      const uniqueModules = [...new Set(modules)];

      getLicences(uniqueModules, {directory, production}, function (err, modules) {
        if (err) {
          return callback(err);
        }

        mkdirp(compiler.options.output.path, function (err) {
          if (err) {
            return callback(err);
          }

          writeFile(
            path.join(compiler.options.output.path, filename),
            formatModules({title, modules}),
            {flags: "w+"},
            callback
          );
        })
      })
    });
  }
}
