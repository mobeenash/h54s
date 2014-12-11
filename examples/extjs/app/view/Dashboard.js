Ext.define('h54sExample.view.Dashboard', {
  extend: 'Ext.panel.Panel',

  layout: {
    type: 'vbox',
    align: 'center',

  },

  items: [{
    xtype: 'panel',
    width: 500,
    flex: 1,
//    frame: true, // ovo mu napravi ovaj plavi okvir oko celog panela, cisto pomaze da vidis gde je panel, skini ga ako oces
    bodyPadding: 5,
    id: 'mainPanel',
    style: {
      marginTop: '100px'
    },
    layout: {
      type: 'vbox',
      align: 'stretch',

    },

    listeners: {
      afterrender: function () {
        this.setLoading(true);
      },
    },

    items: [
      {
        xtype: 'container',
        flex: 0,
        layout: {
          type: 'hbox',
          pack: 'start',
          align: 'stretch'
        },
        style: {
          marginBottom: '5px'
        },
        items: [
          {
            xtype: 'textfield',
            name: 'filter',
            allowBlank: true,
            emptyText: 'Search',
            flex: 2.5,
            listeners: {
              change: function(e) {
                var store = Ext.getStore('TableStore');
                store.filterBy(function(record, id) {
                  var recValue = record.get('memname').toLowerCase();
                  var value = e.getValue().toLowerCase();
                  if (!e.getValue() || recValue.indexOf(value) !== -1)
                    return true;
                  else
                    return false;
                });
              }
            }
          }, {
            xtype: 'tbfill'
          }, {
            xtype: 'combobox',
            emptyText: 'Library',
            align: 'right',
            store: 'LibraryListStore',
            displayField: 'libname',
            queryMode: 'local',
            typeAhead: true,
            listeners: {
              select: function (e) {
                var me = this;
                sasAdapter.addTable([
                  {
                    libraryName: e.getValue()
                  }
                ], 'lib');
                sasAdapter.call('/AJAX/h54s_test/datasetList', function (err, res) {
                  if (err && err.type === 'notLoggedinError') {
                    me.logonWin.show(false, function () {
                      setTimeout(function () {
                        me.logonWin.down('textfield[name="ux"]').focus(true, 100);
                      }, 400);
                    });
                  } else if (err) {
                    alert(err.message);
                  } else {
                    var store = Ext.getStore('TableStore');
                    store.getProxy().setData(res.tablelist);
                    Ext.getCmp('tableGridPaging').setStore(store);
                    store.loadPage(1);
                  }
                });
              }
            }
          }
        ]
      },
      {
        id: 'tableGrid',
        xtype: 'gridpanel',
        flex: 1,
        store: 'TableStore',
        columns: [
          {
            xtype: 'gridcolumn',
            dataIndex: 'libname',
            text: 'Library Name',
            flex: 1,
            menuDisabled: true
          },
          {
            xtype: 'gridcolumn',
            dataIndex: 'memname',
            text: 'Memory Name',
            flex: 1,
            menuDisabled: true
          }
        ],
        listeners: {
          select: function(e) {
            var row = e.getSelection()[0];
            e.clearSelections();
            e.view.refresh();
            var detailWindow = Ext.create('h54sExample.view.TableWindow');
            sasAdapter.addTable([
              {
                libname: row.data.libname,
                memname: row.data.memname
              }
            ], 'data');
            detailWindow.show();
          }
        },
        dockedItems: [{
          id:'tableGridPaging',
          xtype: 'pagingtoolbar',
          store: Ext.getStore('TableStore'),
          dock: 'bottom',
          displayInfo: true,
          displayMsg: '{0} - {1} of {2}'
        }],
      },
    ]
  }],

});
