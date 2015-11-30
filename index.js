var transit = require('transit-js');
var Immutable = require('immutable');

function hasNameSpaces(nameSpaces) {
  if (
    nameSpaces !== undefined &&
    nameSpaces !== null &&
    nameSpaces.length > 0
  ) {
    return true;
  } else {
    return false;
  }
}

/**
 * Create a read handler that can parse the given protobuf namespaces.
 * @param {Array} nameSpaces - An array of protobuf namespaces we want to decode
 */
function createProtobufReadHandler(nameSpaces) {
  var nameSpaceMap = {}
  nameSpaces.forEach(function(nameSpace) {
    nameSpaceMap[nameSpace.$type.name] = nameSpace;
  });
  return function(v) {
    var fqn = v[0];
    var data = v[1];
    var ns = fqn.split('.')[1];
    var namespace = nameSpaceMap[ns];
    var builder = namespace.$type.resolve(fqn).clazz;
    return builder.decode64(data);
  }
}

/**
 * Create a reader that can decode any provided protobuf namespaces
 * @param {Array} nameSpaces - An array of protobuf namespaces we want registered to decode
 */
function createReader(nameSpaces) {

  handlers = {
    iM: function(v) {
      var m = Immutable.Map().asMutable();
      for (var i = 0; i < v.length; i += 2) {
        m = m.set(v[i], v[i + 1]);
      }
      return m.asImmutable();
    },
    iOM: function(v) {
      var m = Immutable.OrderedMap().asMutable();
      for (var i = 0; i < v.length; i += 2) {
        m = m.set(v[i], v[i + 1]);
      }
      return m.asImmutable();
    },
    iL: function(v) {
      return Immutable.List(v);
    },
    iS: function(v) {
      return Immutable.Set(v);
    },
    iOS: function(v) {
      return Immutable.OrderedSet(v);
    },
  };

  if (hasNameSpaces(nameSpaces)) {
    handlers['PB'] = createProtobufReadHandler(nameSpaces);
  }

  return transit.reader('json', {
    mapBuilder: {
      init: function() {
        return {};
      },
      add: function(m, k, v) {
        m[k] = v;
        return m;
      },
      finalize: function(m) {
        return m;
      }
    },
    handlers: handlers
  });
};

/**
 * Create a writer that can optionally serialize protobuf objects.
 * @param {Function} predicate - a filter function you want to use to ignore values
 * @param {Array} protoConstructor - the optional protobuf constructor you want to support serializing
 */
function createWriter(predicate, protoConstructor) {
  var handlers = transit.map([
    Immutable.Map, transit.makeWriteHandler({
      tag: function() {
        return 'iM';
      },
      rep: function(m) {
        var i = 0, a = new Array(2 * m.size);
        if (predicate) {
          m = m.filter(predicate);
        }
        m.forEach(function(v, k) {
          a[i++] = k;
          a[i++] = v;
        });
        return a;
      }
    }),
    Immutable.OrderedMap, transit.makeWriteHandler({
      tag: function() {
        return 'iOM';
      },
      rep: function(m) {
        var i = 0, a = new Array(2 * m.size);
        if (predicate) {
          m = m.filter(predicate);
        }
        m.forEach(function(v, k) {
          a[i++] = k;
          a[i++] = v;
        });
        return a;
      }
    }),
    Immutable.List, transit.makeWriteHandler({
      tag: function() {
        return "iL";
      },
      rep: function(v) {
        if (predicate) {
          v = v.filter(predicate);
        }
        return v.toArray();
      }
    }),
    Immutable.Set, transit.makeWriteHandler({
      tag: function() {
        return "iS";
      },
      rep: function(v) {
        if (predicate) {
          v = v.filter(predicate);
        }
        return v.toArray();
      }
    }),
    Immutable.OrderedSet, transit.makeWriteHandler({
      tag: function() {
        return "iOS";
      },
      rep: function(v) {
        if (predicate) {
          v = v.filter(predicate);
        }
        return v.toArray();
      }
    }),
    Function, transit.makeWriteHandler({
      tag: function() {
        return '_';
      },
      rep: function() {
        return null;
      }
    })
  ]);

  if (typeof protoConstructor === 'function') {
    handlers.set(
      protoConstructor,
      transit.makeWriteHandler({
        tag: function() {
          return "PB";
        },
        rep: function(v) {
          return [v.$type.fqn(), v.encode64()];
        }
      })
    );
  }

  return transit.writer('json', {handlers: handlers});
}

var writer = createWriter(false);
var reader = createReader();

exports.toJSON = toJSON;
function toJSON(data) {
  return writer.write(data);
}

exports.fromJSON = fromJSON;
function fromJSON(data) {
  return reader.read(data);
}

function withFilter(predicate) {
  var filteredWriter = createWriter(predicate);
  return {
    toJSON: function(data) {
      return filteredWriter.write(data);
    },
    fromJSON: fromJSON
  };
}
exports.withFilter = withFilter;

/**
 * Register protobuf nameSpaces with the transit write and read handlers.
 * @param {Array} nameSpaces - an array of protobuf nameSpaces we want to decode
 * @param {Function} constructor - the protobuf constructor you want to
 *  register. Protobufjs dynamically creates constructors for messages, so we
 *  can't use some base message type.
 */
function withNameSpaces(nameSpaces, constructor) {
  var reader = createReader(nameSpaces);
  var writer = createWriter(undefined, constructor);
  return {
    toJSON: function(data) {
      return writer.write(data);
    },
    fromJSON: function(data) {
      return reader.read(data);
    },
  }
}
exports.withNameSpaces = withNameSpaces;
