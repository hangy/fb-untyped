function getAccessToken() {
  if (typeof(localStorage.token) !== 'undefined') {
    var parsed = JSON.parse(localStorage.token);
    if (parsed && parsed.access_token) {
      return parsed;
    } else {
      return {};
    }
  } else {
    return {};
  }
}

function getNewToken() {
  return new Promise(function(accept) {
    var redirectUrl = new URL('oauthcallback.html', window.location.href).href;
    var win = window.open('https://accounts.google.com/o/oauth2/auth?response_type=token&redirect_uri=' + encodeURIComponent(redirectUrl) + '&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Ffreebase&client_id=' + encodeURIComponent(CLIENT_ID), 'Freebase Authorization');
    var timer = setInterval(function() {
      if (win.closed !== false) {
        window.clearInterval(timer);
        accept();
      }
    });
  });
}

function initOAuth2() {
  $.freebase.oauth2 = $.freebase.OAuth2({client_id: CLIENT_ID, client_secret: CLIENT_SECRET}, getAccessToken, saveAccessToken);
}

function saveAccessToken(token) {
  localStorage.token = JSON.stringify(token);
}

function getTopics(keyword, exclude, cursor, dateline) {
  return new Promise(function(accept, reject) {
    var query = {
      "id":     null,
      "name":   null,
      "t:type": "/common/topic",
      "type": [{
        "id":       null,
        "key": {
          "namespace": "/common",
          "optional":  "forbidden",
          "value":     "topic"
        },
        "optional": "forbidden"
      }],
      "!/freebase/duplicate_collection/duplicates": {
        "id":       null,
        "optional": "forbidden"
      },
      "!/freebase/opinion_collection/mark_for_delete": {
        "id":       null,
        "optional": "forbidden"
      },
      "!/freebase/review_flag/item": [{
        "id":       null,
        "optional": "forbidden"
      }],
      "name~=": keyword,
      "limit": 25
    };

    var excludeWords = [];
    if (exclude) {
      excludeWords = exclude.split(" ");
      for (i = 0; i < excludeWords.length; i++) {
        query['n'+i+':name'] = [{"optional" : "forbidden", "value~=" : excludeWords[i]}];
      }
    }

    $.freebase.mqlread([query], {oauth2: $.freebase.oauth2, key: API_KEY, cursor: cursor, dateline: dateline}, function(data) {
      if (!data || data.error || data.errors || !data.result) {
        reject(data);
      } else {
        accept(data);
      }
    });
  });
}

function getIncludedTypes(type) {
  return new Promise(function(accept, reject) {
    var query = {
      "type": "/type/type",
      "id":   type,
      "/freebase/type_hints/included_types": [{
        "id": null,
        "optional": true
      }]
    };

    $.freebase.mqlread(query, {oauth2: $.freebase.oauth2, key: API_KEY}, function(data) {
      if (!data || data.error || data.errors || !data.result) {
        reject(data);
      } else {
        accept(data);
      }
    });
  });
}

function write(ids, type) {
  return new Promise(function(accept, reject) {
    var types = [ type ];
    getIncludedTypes(type).then(function(data) {
      var includedTypes = data.result['/freebase/type_hints/included_types'];
      for (var i in includedTypes) {
        types.push(includedTypes[i].id);
      }

      var promises = [];

      for (i in ids) {
        promises.push(addTypes(ids[i], types));
      }

      Promise.all(promises).then(function(results) { accept(results); });
    });
  });
}

function addTypes(id, types) {
  return new Promise(function(accept, reject) {
    var query = { id: id, type: [] };
    for (i in types) {
      query.type[i] = { connect: 'insert', id: types[i] };
    }

    $.freebase.mqlwrite(query, {oauth2: $.freebase.oauth2, key: API_KEY}, function(data) {
      if (!data || data.error || data.errros) {
        reject(data);
      } else {
        accept(data);
      }
    });
  });
}

function deleteTopics(ids) {
  return new Promise(function(accept, reject) {
    var promises = [];
    for (i in ids) {
      promises.push(deleteTopic(ids[i]));
    }

    Promise.all(promises).then(function(results) { accept(results); });
  });
}

function deleteTopic(id) {
  return new Promise(function(accept, reject) {
    var query = {
      id: null,
      type: '/freebase/review_flag',
      item: { id: id },
      kind: { id: '/freebase/flag_kind/delete' },
      create: 'unless_exists'
    };

    $.freebase.mqlwrite(query, {oauth2: $.freebase.oauth2, key: API_KEY}, function(data) {
      if (!data || data.error || data.errros) {
        reject(data);
      } else {
        accept(data);
      }
    });
  });
}

function getTopicDescription(id, index) {
  return new Promise(function(accept) {
    var url = $.freebase.globals.host + 'topic' + id + '?filter=/common/topic/description&limit=1&key=' + API_KEY;
    get(url).then(function(data) {
      var d = JSON.parse(data);
      if (d.error) {
        accept({ index: index, description: d.error.code + ':' + d.error.message });
      } else if (!d.property || !d.property['/common/topic/description'] || !d.property['/common/topic/description'].values) {
        accept({ index: index, description: '' });
      } else {
        accept({ index: index, description: d.property['/common/topic/description'].values[0].text });
      }
    });
  });
}
